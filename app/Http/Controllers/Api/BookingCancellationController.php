<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BookingResource;
use App\Models\Account;
use App\Models\Booking;
use App\Models\TherapistProfile;
use App\Services\Bookings\BookingCancellationPolicy;
use App\Services\Bookings\BookingCancellationSettlementService;
use App\Services\Notifications\BookingNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

class BookingCancellationController extends Controller
{
    private const USER_CANCELABLE_STATUSES = [
        Booking::STATUS_PAYMENT_AUTHORIZING,
        Booking::STATUS_REQUESTED,
        Booking::STATUS_ACCEPTED,
        Booking::STATUS_MOVING,
        Booking::STATUS_ARRIVED,
    ];

    private const THERAPIST_CANCELABLE_STATUSES = [
        Booking::STATUS_ACCEPTED,
        Booking::STATUS_MOVING,
        Booking::STATUS_ARRIVED,
    ];

    private const THERAPIST_COUNTABLE_CANCEL_STATUSES = [
        Booking::STATUS_ACCEPTED,
        Booking::STATUS_MOVING,
        Booking::STATUS_ARRIVED,
    ];

    public function preview(Request $request, Booking $booking, BookingCancellationPolicy $policy): JsonResponse
    {
        $actorRole = $this->actorRole($booking, $request->user());

        abort_unless(
            in_array($booking->status, $this->cancelableStatuses($actorRole), true),
            409,
            'この予約は、現在の状態ではキャンセルできません。'
        );

        return response()->json([
            'data' => $policy->preview($booking, $actorRole),
        ]);
    }

    public function store(
        Request $request,
        Booking $booking,
        BookingCancellationPolicy $policy,
        BookingCancellationSettlementService $settlementService,
        BookingNotificationService $bookingNotificationService,
    ): JsonResponse {
        $actor = $request->user();
        $actorRole = $this->actorRole($booking, $actor);

        abort_unless(
            in_array($booking->status, $this->cancelableStatuses($actorRole), true),
            409,
            'この予約は、現在の状態ではキャンセルできません。'
        );

        $validated = $request->validate([
            'reason_code' => ['required', 'string', 'max:100'],
            'reason_note' => $actorRole === 'therapist'
                ? ['required', 'string', 'min:1', 'max:1000']
                : ['nullable', 'string', 'max:1000'],
        ]);

        $result = DB::transaction(function () use ($actor, $actorRole, $booking, $policy, $validated): array {
            $lockedBooking = Booking::query()
                ->whereKey($booking->id)
                ->lockForUpdate()
                ->firstOrFail();

            abort_unless(
                in_array($lockedBooking->status, $this->cancelableStatuses($actorRole), true),
                409,
                'この予約は、現在の状態ではキャンセルできません。'
            );

            $preview = $policy->preview($lockedBooking, $actorRole);
            $fromStatus = $lockedBooking->status;

            $lockedBooking->forceFill([
                'status' => Booking::STATUS_CANCELED,
                'request_expires_at' => null,
                'canceled_at' => now(),
                'canceled_by_account_id' => $actor->id,
                'cancel_reason_code' => $validated['reason_code'],
                'cancel_reason_note_encrypted' => filled($validated['reason_note'] ?? null)
                    ? Crypt::encryptString($validated['reason_note'])
                    : null,
            ])->save();

            $lockedBooking->statusLogs()->create([
                'from_status' => $fromStatus,
                'to_status' => Booking::STATUS_CANCELED,
                'actor_account_id' => $actor->id,
                'actor_role' => $actorRole,
                'reason_code' => $validated['reason_code'],
                'metadata_json' => [
                    ...$preview,
                    'reason_note' => $validated['reason_note'] ?? null,
                ],
            ]);

            if ($actorRole === 'therapist' && in_array($fromStatus, self::THERAPIST_COUNTABLE_CANCEL_STATUSES, true)) {
                TherapistProfile::query()
                    ->whereKey($lockedBooking->therapist_profile_id)
                    ->increment('therapist_cancellation_count');
            }

            return [$lockedBooking->refresh()->load('currentQuote'), $preview];
        });

        [$canceledBooking, $preview] = $result;

        $settlementService->settle($canceledBooking, $preview);
        $bookingNotificationService->notifyCanceled($canceledBooking->refresh());

        $canceledBooking->refresh()->load([
            'currentQuote',
            'currentPaymentIntent',
            'canceledBy',
            'refunds' => fn ($query) => $query->latest('id'),
        ]);

        return response()->json([
            'data' => [
                'booking' => (new BookingResource($canceledBooking))->resolve($request),
                'cancellation' => $preview,
            ],
        ]);
    }

    private function actorRole(Booking $booking, Account $actor): string
    {
        if ($booking->user_account_id === $actor->id) {
            return 'user';
        }

        if ($booking->therapist_account_id === $actor->id) {
            return 'therapist';
        }

        abort(404);
    }

    private function cancelableStatuses(string $actorRole): array
    {
        return $actorRole === 'therapist'
            ? self::THERAPIST_CANCELABLE_STATUSES
            : self::USER_CANCELABLE_STATUSES;
    }
}
