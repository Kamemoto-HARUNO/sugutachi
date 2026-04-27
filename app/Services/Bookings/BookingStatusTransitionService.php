<?php

namespace App\Services\Bookings;

use App\Models\Account;
use App\Models\Booking;
use Illuminate\Support\Facades\DB;

class BookingStatusTransitionService
{
    public function transition(
        Booking $booking,
        ?Account $actor,
        string $actorRole,
        array $allowedFromStatuses,
        string $toStatus,
        string $reasonCode,
        array $attributes = [],
        ?callable $beforeTransition = null,
    ): Booking {
        return DB::transaction(function () use (
            $actor,
            $actorRole,
            $allowedFromStatuses,
            $attributes,
            $beforeTransition,
            $booking,
            $reasonCode,
            $toStatus
        ): Booking {
            $lockedBooking = Booking::query()
                ->whereKey($booking->id)
                ->lockForUpdate()
                ->firstOrFail();

            abort_unless(
                in_array($lockedBooking->status, $allowedFromStatuses, true),
                409,
                "現在の予約ステータス（{$lockedBooking->status}）からは、{$toStatus} へ進めません。"
            );

            if ($beforeTransition) {
                $beforeTransition($lockedBooking);
            }

            $fromStatus = $lockedBooking->status;

            $lockedBooking->forceFill([
                ...$attributes,
                'status' => $toStatus,
            ])->save();

            $lockedBooking->statusLogs()->create([
                'from_status' => $fromStatus,
                'to_status' => $toStatus,
                'actor_account_id' => $actor?->id,
                'actor_role' => $actorRole,
                'reason_code' => $reasonCode,
            ]);

            return $lockedBooking->refresh();
        });
    }
}
