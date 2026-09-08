<?php

namespace App\Services\DirectMessages;

use App\Models\Booking;
use App\Models\RoleRelationship;
use App\Models\TherapistProfile;
use Illuminate\Support\Facades\DB;

class BlockBookingService
{
    public const BEFORE_START = ['payment_authorizing', 'requested', 'accepted', 'moving', 'arrived'];

    public const REVIEW = ['in_progress', 'therapist_completed', 'interrupted'];

    public function affected(RoleRelationship $relationship)
    {
        return Booking::query()->where('user_account_id', $relationship->user_account_id)->where('therapist_account_id', $relationship->therapist_account_id)
            ->whereIn('status', [...self::BEFORE_START, ...self::REVIEW]);
    }

    public function cancelBeforeStart(RoleRelationship $relationship): void
    {
        foreach ($this->affected($relationship)->orderBy('id')->lockForUpdate()->get() as $booking) {
            $review = $booking->hasPendingNoShowReport() || in_array($booking->status, self::REVIEW, true);
            $inserted = DB::table('block_booking_actions')->insertOrIgnore(['relationship_id' => $relationship->id, 'booking_id' => $booking->id, 'status' => $review ? 'review' : 'pending', 'due_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
            if (! $inserted) {
                continue;
            }
            app(SystemNotice::class)->booking($booking, $review ? 'review' : 'pending');
            if ($review) {
                continue;
            }
            $from = $booking->status;
            $status = match ($from) {
                'payment_authorizing' => 'payment_canceled', 'requested' => 'rejected', default => 'canceled'
            };
            $booking->forceFill(['status' => $status, 'request_expires_at' => null, 'canceled_at' => now(), 'canceled_by_account_id' => $relationship->therapist_account_id, 'cancel_reason_code' => 'therapist_relationship_block'])->save();
            $booking->statusLogs()->create(['from_status' => $from, 'to_status' => $status, 'actor_account_id' => $relationship->therapist_account_id, 'actor_role' => 'therapist', 'reason_code' => 'therapist_relationship_block', 'metadata_json' => ['cancel_fee_amount' => 0]]);
            if (in_array($from, ['accepted', 'moving', 'arrived'], true)) {
                TherapistProfile::query()->whereKey($booking->therapist_profile_id)->increment('therapist_cancellation_count');
            }
        }
    }
}
