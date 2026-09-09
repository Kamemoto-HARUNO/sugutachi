<?php

namespace App\Services\DirectMessages;

use App\Models\Booking;
use App\Models\Refund;
use App\Models\RoleRelationship;
use App\Models\StripeDispute;
use App\Models\TherapistProfile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class BlockBookingService
{
    public const BEFORE_START = ['payment_authorizing', 'requested', 'accepted', 'moving', 'arrived'];

    public const REVIEW = ['in_progress', 'therapist_completed', 'interrupted'];

    public function affected(RoleRelationship $relationship)
    {
        return Booking::query()->where('user_account_id', $relationship->user_account_id)->where('therapist_account_id', $relationship->therapist_account_id)
            ->whereIn('status', [...self::BEFORE_START, ...self::REVIEW]);
    }

    public function hasFinancialReview(Booking $booking): bool
    {
        return $booking->refunds()->where(fn ($q) => $q->whereNull('reason_code')->orWhere('reason_code', '!=', 'therapist_relationship_block'))
            ->whereIn('status', [Refund::STATUS_REQUESTED, Refund::STATUS_APPROVED])->exists()
            || $booking->disputes()->whereIn('status', [StripeDispute::STATUS_NEEDS_RESPONSE, StripeDispute::STATUS_UNDER_REVIEW])->exists();
    }

    public function requiresReview(Booking $booking): bool
    {
        return $booking->hasPendingNoShowReport() || in_array($booking->status, self::REVIEW, true)
            || $this->hasFinancialReview($booking);
    }

    public function cancelBeforeStart(RoleRelationship $relationship): void
    {
        foreach ($this->affected($relationship)->orderBy('id')->lockForUpdate()->get() as $booking) {
            $review = $this->requiresReview($booking);
            $inserted = DB::table('block_booking_actions')->insertOrIgnore(['relationship_id' => $relationship->id, 'booking_id' => $booking->id, 'status' => $review ? 'review' : 'pending', 'due_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
            $noticeEvent = null;
            if (! $inserted) {
                // A fresh block after an admin release must not inherit the old
                // release decision. Repeated calls for an active block stay idempotent.
                $reopened = DB::table('block_booking_actions')->where('booking_id', $booking->id)->where('status', 'resolved')
                    ->update(['status' => $review ? 'review' : 'pending', 'attempts' => 0, 'due_at' => now(), 'completed_at' => null, 'updated_at' => now()]);
                if (! $reopened) {
                    continue;
                }
                $noticeEvent = 'reblock:'.Str::ulid();
            }
            app(SystemNotice::class)->booking($booking, $review ? 'review' : 'pending', $noticeEvent);
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
