<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BookingResource;
use App\Models\Booking;
use App\Services\Bookings\BookingCompletionService;
use App\Services\Bookings\BookingRequestAdjustmentService;
use App\Services\Bookings\BookingSettlementService;
use App\Services\Bookings\BookingStatusTransitionService;
use App\Services\Bookings\ScheduledBookingPolicy;
use App\Services\Notifications\BookingNotificationService;
use App\Services\Payments\BookingPaymentIntentCancellationService;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class BookingStatusController extends Controller
{
    private const INPUT_TIMEZONE = 'Asia/Tokyo';

    public function accept(
        Request $request,
        Booking $booking,
        BookingStatusTransitionService $transition,
        ScheduledBookingPolicy $scheduledBookingPolicy,
        BookingNotificationService $bookingNotificationService,
    ): BookingResource {
        $this->authorizeTherapist($request, $booking);

        $validated = $request->validate([
            'buffer_before_minutes' => ['sometimes', 'integer', 'min:0', 'max:360'],
            'buffer_after_minutes' => ['sometimes', 'integer', 'min:0', 'max:360'],
        ]);

        if (! $booking->is_on_demand && (! array_key_exists('buffer_before_minutes', $validated) || ! array_key_exists('buffer_after_minutes', $validated))) {
            throw ValidationException::withMessages([
                'buffer_before_minutes' => ['日時指定の予約では、開始前の移動・準備時間の入力が必要です。'],
                'buffer_after_minutes' => ['日時指定の予約では、終了後の移動・準備時間の入力が必要です。'],
            ]);
        }

        $bufferBeforeMinutes = $validated['buffer_before_minutes'] ?? 0;
        $bufferAfterMinutes = $validated['buffer_after_minutes'] ?? 0;

        abort_if(
            $booking->hasPendingTherapistAdjustment(),
            409,
            '利用者確認待ちの時間変更提案があります。利用者の返答を待つか、提案内容を更新してください。'
        );

        $booking = $transition->transition(
            booking: $booking,
            actor: $request->user(),
            actorRole: 'therapist',
            allowedFromStatuses: [Booking::STATUS_REQUESTED],
            toStatus: Booking::STATUS_ACCEPTED,
            reasonCode: 'therapist_accepted',
            attributes: [
                'accepted_at' => now(),
                'confirmed_at' => now(),
                'buffer_before_minutes' => $bufferBeforeMinutes,
                'buffer_after_minutes' => $bufferAfterMinutes,
                'request_expires_at' => null,
            ],
            beforeTransition: fn (Booking $lockedBooking) => $scheduledBookingPolicy->assertCanAccept(
                booking: $lockedBooking,
                bufferBeforeMinutes: $bufferBeforeMinutes,
                bufferAfterMinutes: $bufferAfterMinutes,
            ),
        );

        $bookingNotificationService->notifyAccepted($booking->refresh());

        return new BookingResource($booking->load('currentQuote'));
    }

    public function proposeAdjustment(
        Request $request,
        Booking $booking,
        BookingRequestAdjustmentService $bookingRequestAdjustmentService,
        BookingNotificationService $bookingNotificationService,
    ): BookingResource {
        $this->authorizeTherapist($request, $booking);

        abort_unless($booking->status === Booking::STATUS_REQUESTED, 409, '承認待ちの予約リクエストだけ時間変更を提案できます。');
        abort_unless(! $booking->is_on_demand, 409, '時間変更の提案は日時指定の予約リクエストだけで利用できます。');

        $validated = $request->validate([
            'scheduled_start_at' => ['required', 'date'],
            'scheduled_end_at' => ['required', 'date'],
            'buffer_before_minutes' => ['required', 'integer', 'min:0', 'max:360'],
            'buffer_after_minutes' => ['required', 'integer', 'min:0', 'max:360'],
        ]);

        $attributes = $bookingRequestAdjustmentService->buildProposal(
            booking: $booking,
            proposedStartAt: $this->parseInputDateTime($validated['scheduled_start_at']),
            proposedEndAt: $this->parseInputDateTime($validated['scheduled_end_at']),
            bufferBeforeMinutes: (int) $validated['buffer_before_minutes'],
            bufferAfterMinutes: (int) $validated['buffer_after_minutes'],
        );

        $booking->forceFill($attributes)->save();
        $booking->statusLogs()->create([
            'from_status' => $booking->status,
            'to_status' => $booking->status,
            'actor_account_id' => $request->user()->id,
            'actor_role' => 'therapist',
            'reason_code' => 'therapist_proposed_adjustment',
        ]);

        $bookingNotificationService->notifyAdjustmentProposed($booking->refresh()->loadMissing(['userAccount', 'therapistProfile']));

        return new BookingResource($booking->load('currentQuote'));
    }

    public function acceptAdjustment(
        Request $request,
        Booking $booking,
        BookingRequestAdjustmentService $bookingRequestAdjustmentService,
        BookingStatusTransitionService $transition,
        BookingNotificationService $bookingNotificationService,
    ): BookingResource {
        abort_unless($booking->user_account_id === $request->user()->id, 404);
        abort_unless($booking->status === Booking::STATUS_REQUESTED, 409, '承認待ちの予約リクエストだけ確認できます。');

        $attributes = $bookingRequestAdjustmentService->acceptedProposalAttributes($booking);

        $booking = $transition->transition(
            booking: $booking,
            actor: $request->user(),
            actorRole: 'user',
            allowedFromStatuses: [Booking::STATUS_REQUESTED],
            toStatus: Booking::STATUS_ACCEPTED,
            reasonCode: 'user_accepted_adjustment',
            attributes: $attributes,
        );

        $bookingNotificationService->notifyAccepted($booking->refresh()->loadMissing(['userAccount', 'therapistProfile']));
        $bookingNotificationService->notifyAdjustmentAccepted($booking->refresh()->loadMissing(['therapistAccount', 'therapistProfile']));

        return new BookingResource($booking->load('currentQuote'));
    }

    public function rejectAdjustment(
        Request $request,
        Booking $booking,
        BookingRequestAdjustmentService $bookingRequestAdjustmentService,
        BookingStatusTransitionService $transition,
        BookingPaymentIntentCancellationService $paymentIntentCancellationService,
        BookingNotificationService $bookingNotificationService,
    ): BookingResource {
        abort_unless($booking->user_account_id === $request->user()->id, 404);
        abort_unless($booking->status === Booking::STATUS_REQUESTED, 409, '承認待ちの予約リクエストだけ見送りできます。');
        abort_unless($booking->hasPendingTherapistAdjustment(), 409, '見送りできる時間変更提案がありません。');

        $booking = $transition->transition(
            booking: $booking,
            actor: $request->user(),
            actorRole: 'user',
            allowedFromStatuses: [Booking::STATUS_REQUESTED],
            toStatus: Booking::STATUS_CANCELED,
            reasonCode: 'user_rejected_adjustment',
            attributes: [
                ...$bookingRequestAdjustmentService->clearProposalAttributes(),
                'canceled_at' => now(),
                'canceled_by_account_id' => $request->user()->id,
                'cancel_reason_code' => 'user_rejected_adjustment',
                'request_expires_at' => null,
            ],
        );

        $paymentIntentCancellationService->cancelCurrentForBooking(
            booking: $booking,
            lastStripeEventId: 'system.user_rejected_adjustment',
        );

        $bookingNotificationService->notifyCanceled($booking->refresh());

        return new BookingResource($booking->load([
            'currentQuote',
            'currentPaymentIntent',
            'canceledBy',
            'refunds' => fn ($query) => $query->latest('id'),
        ]));
    }

    public function reject(
        Request $request,
        Booking $booking,
        BookingStatusTransitionService $transition,
        BookingPaymentIntentCancellationService $paymentIntentCancellationService,
        BookingNotificationService $bookingNotificationService,
    ): BookingResource {
        $this->authorizeTherapist($request, $booking);

        $booking = $transition->transition(
            booking: $booking,
            actor: $request->user(),
            actorRole: 'therapist',
            allowedFromStatuses: [Booking::STATUS_REQUESTED],
            toStatus: Booking::STATUS_REJECTED,
            reasonCode: 'therapist_rejected',
            attributes: [
                'canceled_at' => now(),
                'canceled_by_account_id' => $request->user()->id,
                'cancel_reason_code' => 'therapist_rejected',
                'request_expires_at' => null,
            ],
        );

        $paymentIntentCancellationService->cancelCurrentForBooking(
            booking: $booking,
            lastStripeEventId: 'system.therapist_rejected',
        );

        $bookingNotificationService->notifyCanceled($booking->refresh());

        return new BookingResource($booking->load([
            'currentQuote',
            'currentPaymentIntent',
            'canceledBy',
            'refunds' => fn ($query) => $query->latest('id'),
        ]));
    }

    public function moving(
        Request $request,
        Booking $booking,
        BookingStatusTransitionService $transition,
        BookingNotificationService $bookingNotificationService,
    ): BookingResource
    {
        $this->authorizeTherapist($request, $booking);

        $booking = $transition->transition(
            booking: $booking,
            actor: $request->user(),
            actorRole: 'therapist',
            allowedFromStatuses: [Booking::STATUS_ACCEPTED],
            toStatus: Booking::STATUS_MOVING,
            reasonCode: 'therapist_moving',
            attributes: [
                'moving_at' => now(),
                'arrival_confirmation_code' => str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT),
                'arrival_confirmation_code_generated_at' => now(),
            ],
        );

        $bookingNotificationService->notifyMoving($booking->loadMissing(['userAccount', 'therapistProfile']));

        return new BookingResource($booking->load('currentQuote'));
    }

    public function arrived(
        Request $request,
        Booking $booking,
        BookingStatusTransitionService $transition,
        BookingNotificationService $bookingNotificationService,
    ): BookingResource
    {
        $this->authorizeTherapist($request, $booking);

        if (filled($booking->arrival_confirmation_code)) {
            $validated = $request->validate([
                'arrival_confirmation_code' => ['required', 'digits:4'],
            ]);

            throw_if(
                (string) $validated['arrival_confirmation_code'] !== (string) $booking->arrival_confirmation_code,
                ValidationException::withMessages([
                    'arrival_confirmation_code' => ['利用者の画面に表示されている4桁コードを入力してください。'],
                ]),
            );
        }

        $booking = $transition->transition(
            booking: $booking,
            actor: $request->user(),
            actorRole: 'therapist',
            allowedFromStatuses: [Booking::STATUS_MOVING],
            toStatus: Booking::STATUS_ARRIVED,
            reasonCode: 'therapist_arrived',
            attributes: [
                'arrived_at' => now(),
                'arrival_confirmation_code' => null,
            ],
        );

        $bookingNotificationService->notifyArrived($booking->loadMissing(['userAccount', 'therapistProfile']));

        return new BookingResource($booking->load('currentQuote'));
    }

    public function start(
        Request $request,
        Booking $booking,
        BookingStatusTransitionService $transition,
        BookingNotificationService $bookingNotificationService,
    ): BookingResource
    {
        $this->authorizeTherapist($request, $booking);

        $booking = $transition->transition(
            booking: $booking,
            actor: $request->user(),
            actorRole: 'therapist',
            allowedFromStatuses: [Booking::STATUS_ARRIVED],
            toStatus: Booking::STATUS_IN_PROGRESS,
            reasonCode: 'therapist_started',
            attributes: [
                'started_at' => now(),
            ],
        );

        $bookingNotificationService->notifyStarted($booking->loadMissing(['userAccount', 'therapistProfile']));

        return new BookingResource($booking->load('currentQuote'));
    }

    public function complete(
        Request $request,
        Booking $booking,
        BookingSettlementService $bookingSettlementService,
        BookingStatusTransitionService $transition,
        BookingNotificationService $bookingNotificationService,
    ): BookingResource
    {
        $this->authorizeTherapist($request, $booking);

        $validated = $request->validate([
            'started_at' => ['required', 'date'],
            'ended_at' => ['required', 'date'],
        ]);

        $reportedAt = CarbonImmutable::now();
        $startedAt = $this->parseInputDateTime($validated['started_at']);
        $endedAt = $this->parseInputDateTime($validated['ended_at']);
        $attributes = $bookingSettlementService->buildCompletionAttributes(
            booking: $booking,
            startedAt: $startedAt,
            endedAt: $endedAt,
            reportedAt: $reportedAt,
        );

        $booking = $transition->transition(
            booking: $booking,
            actor: $request->user(),
            actorRole: 'therapist',
            allowedFromStatuses: [Booking::STATUS_ARRIVED, Booking::STATUS_IN_PROGRESS],
            toStatus: Booking::STATUS_THERAPIST_COMPLETED,
            reasonCode: 'therapist_completed',
            attributes: $attributes,
        );

        $bookingNotificationService->notifyTherapistCompleted($booking->loadMissing(['userAccount', 'therapistProfile']));

        return new BookingResource($booking->load('currentQuote'));
    }

    public function updateCompletionWindow(
        Request $request,
        Booking $booking,
        BookingSettlementService $bookingSettlementService,
        BookingNotificationService $bookingNotificationService,
    ): BookingResource
    {
        $this->authorizeTherapist($request, $booking);

        abort_unless($booking->status === Booking::STATUS_THERAPIST_COMPLETED, 409, '施術時間は、利用者の完了確認待ちの間だけ修正できます。');

        $validated = $request->validate([
            'started_at' => ['required', 'date'],
            'ended_at' => ['required', 'date'],
        ]);

        $booking = $bookingSettlementService->updateTherapistCompletedWindow(
            booking: $booking,
            startedAt: $this->parseInputDateTime($validated['started_at']),
            endedAt: $this->parseInputDateTime($validated['ended_at']),
        );

        $bookingNotificationService->notifyCompletionWindowUpdated($booking->loadMissing(['userAccount', 'therapistProfile']));

        return new BookingResource($booking->load('currentQuote'));
    }

    public function userCompleteConfirmation(
        Request $request,
        Booking $booking,
        BookingCompletionService $bookingCompletionService,
    ): BookingResource
    {
        abort_unless($booking->user_account_id === $request->user()->id, 404);

        $booking = $bookingCompletionService->complete(
            booking: $booking,
            actor: $request->user(),
            actorRole: 'user',
            reasonCode: 'user_completed',
        );

        return new BookingResource($booking->load('currentQuote'));
    }

    private function authorizeTherapist(Request $request, Booking $booking): void
    {
        abort_unless($booking->therapist_account_id === $request->user()->id, 404);
    }

    private function parseInputDateTime(string $value): CarbonImmutable
    {
        return CarbonImmutable::parse($value, self::INPUT_TIMEZONE)->utc();
    }
}
