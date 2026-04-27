<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BookingResource;
use App\Models\Booking;
use App\Services\Bookings\BookingCompletionService;
use App\Services\Bookings\BookingStatusTransitionService;
use App\Services\Bookings\ScheduledBookingPolicy;
use App\Services\Notifications\BookingNotificationService;
use App\Services\Payments\BookingPaymentIntentCancellationService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class BookingStatusController extends Controller
{
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
                'buffer_before_minutes' => ['The buffer before minutes field is required for scheduled bookings.'],
                'buffer_after_minutes' => ['The buffer after minutes field is required for scheduled bookings.'],
            ]);
        }

        $bufferBeforeMinutes = $validated['buffer_before_minutes'] ?? 0;
        $bufferAfterMinutes = $validated['buffer_after_minutes'] ?? 0;

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
        BookingStatusTransitionService $transition,
        BookingNotificationService $bookingNotificationService,
    ): BookingResource
    {
        $this->authorizeTherapist($request, $booking);

        $booking = $transition->transition(
            booking: $booking,
            actor: $request->user(),
            actorRole: 'therapist',
            allowedFromStatuses: [Booking::STATUS_IN_PROGRESS],
            toStatus: Booking::STATUS_THERAPIST_COMPLETED,
            reasonCode: 'therapist_completed',
            attributes: [
                'ended_at' => now(),
            ],
        );

        $bookingNotificationService->notifyTherapistCompleted($booking->loadMissing(['userAccount', 'therapistProfile']));

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
}
