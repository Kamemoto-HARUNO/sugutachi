<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BookingResource;
use App\Models\Account;
use App\Models\Booking;
use App\Services\Bookings\BookingCancellationPolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BookingCancellationController extends Controller
{
    private const CANCELABLE_STATUSES = [
        Booking::STATUS_PAYMENT_AUTHORIZING,
        Booking::STATUS_REQUESTED,
        Booking::STATUS_ACCEPTED,
        Booking::STATUS_MOVING,
        Booking::STATUS_ARRIVED,
    ];

    public function preview(Request $request, Booking $booking, BookingCancellationPolicy $policy): JsonResponse
    {
        $actorRole = $this->actorRole($booking, $request->user());

        abort_unless(in_array($booking->status, self::CANCELABLE_STATUSES, true), 409, 'This booking cannot be canceled.');

        return response()->json([
            'data' => $policy->preview($booking, $actorRole),
        ]);
    }

    public function store(Request $request, Booking $booking, BookingCancellationPolicy $policy): JsonResponse
    {
        $validated = $request->validate([
            'reason_code' => ['required', 'string', 'max:100'],
        ]);
        $actor = $request->user();
        $actorRole = $this->actorRole($booking, $actor);

        $result = DB::transaction(function () use ($actor, $actorRole, $booking, $policy, $validated): array {
            $lockedBooking = Booking::query()
                ->whereKey($booking->id)
                ->lockForUpdate()
                ->firstOrFail();

            abort_unless(in_array($lockedBooking->status, self::CANCELABLE_STATUSES, true), 409, 'This booking cannot be canceled.');

            $preview = $policy->preview($lockedBooking, $actorRole);
            $fromStatus = $lockedBooking->status;

            $lockedBooking->forceFill([
                'status' => Booking::STATUS_CANCELED,
                'request_expires_at' => null,
                'canceled_at' => now(),
                'canceled_by_account_id' => $actor->id,
                'cancel_reason_code' => $validated['reason_code'],
            ])->save();

            $lockedBooking->statusLogs()->create([
                'from_status' => $fromStatus,
                'to_status' => Booking::STATUS_CANCELED,
                'actor_account_id' => $actor->id,
                'actor_role' => $actorRole,
                'reason_code' => $validated['reason_code'],
                'metadata_json' => $preview,
            ]);

            return [$lockedBooking->refresh()->load('currentQuote'), $preview];
        });

        [$canceledBooking, $preview] = $result;

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
}
