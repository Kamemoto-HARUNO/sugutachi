<?php

namespace App\Services\Bookings;

use App\Models\Account;
use App\Models\Booking;
use App\Models\IdentityVerification;
use App\Models\TherapistBookingSetting;
use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;

class ScheduledBookingPolicy
{
    public const PENDING_REQUEST_STATUSES = [
        Booking::STATUS_PAYMENT_AUTHORIZING,
        Booking::STATUS_REQUESTED,
    ];

    public const BLOCKING_SCHEDULED_BOOKING_STATUSES = [
        Booking::STATUS_PAYMENT_AUTHORIZING,
        Booking::STATUS_REQUESTED,
        Booking::STATUS_ACCEPTED,
        Booking::STATUS_MOVING,
        Booking::STATUS_ARRIVED,
        Booking::STATUS_IN_PROGRESS,
        Booking::STATUS_THERAPIST_COMPLETED,
        Booking::STATUS_COMPLETED,
    ];

    public const ACTIVE_ON_DEMAND_BOOKING_STATUSES = [
        Booking::STATUS_PAYMENT_AUTHORIZING,
        Booking::STATUS_REQUESTED,
        Booking::STATUS_ACCEPTED,
        Booking::STATUS_MOVING,
        Booking::STATUS_ARRIVED,
        Booking::STATUS_IN_PROGRESS,
        Booking::STATUS_THERAPIST_COMPLETED,
    ];

    public function assertQuarterHourAligned(CarbonImmutable $time, string $field = 'requested_start_at'): void
    {
        if ($time->second === 0 && $time->minute % 15 === 0) {
            return;
        }

        throw ValidationException::withMessages([
            $field => ['時刻は15分単位で指定してください。'],
        ]);
    }

    public function assertQuarterHourDuration(int $durationMinutes, string $field = 'duration_minutes'): void
    {
        if ($durationMinutes % 15 === 0) {
            return;
        }

        throw ValidationException::withMessages([
            $field => ['予約時間は15分単位で指定してください。'],
        ]);
    }

    public function requestExpiresAt(
        TherapistBookingSetting $bookingSetting,
        CarbonImmutable $requestedStartAt,
        ?CarbonImmutable $createdAt = null,
    ): CarbonImmutable {
        $createdAt ??= CarbonImmutable::now();

        return collect([
            $createdAt->addHours(6),
            $requestedStartAt->subMinutes($bookingSetting->booking_request_lead_time_minutes),
            $requestedStartAt,
        ])
            ->sort()
            ->first();
    }

    public function assertCanCreateRequest(
        Account $user,
        int $therapistProfileId,
        CarbonImmutable $requestedStartAt,
    ): void {
        $this->assertUserCanBook($user);

        if ($this->hasActiveOnDemandBooking($therapistProfileId) && $requestedStartAt->lt(CarbonImmutable::now()->addHours(6))) {
            abort(409, 'このタチキャストは今すぐ予約に対応中のため、6時間以内の予約リクエストは送れません。');
        }

        $sameTherapistPendingRequestExists = Booking::query()
            ->where('user_account_id', $user->id)
            ->where('therapist_profile_id', $therapistProfileId)
            ->where('is_on_demand', false)
            ->whereIn('status', self::PENDING_REQUEST_STATUSES)
            ->exists();

        abort_if(
            $sameTherapistPendingRequestExists,
            409,
            'このタチキャストには、すでに承認待ちの予約リクエストがあります。'
        );

        $pendingRequestCount = Booking::query()
            ->where('user_account_id', $user->id)
            ->where('is_on_demand', false)
            ->whereIn('status', self::PENDING_REQUEST_STATUSES)
            ->count();

        abort_if(
            $pendingRequestCount >= 2,
            409,
            '承認待ちの予約リクエストは2件までです。'
        );
    }

    public function assertUserCanBook(Account $user): void
    {
        $latestIdentityVerification = $user->relationLoaded('latestIdentityVerification')
            ? $user->latestIdentityVerification
            : $user->latestIdentityVerification()->first();

        abort_if(
            ! $latestIdentityVerification
            || $latestIdentityVerification->status !== IdentityVerification::STATUS_APPROVED
            || ! $latestIdentityVerification->is_age_verified,
            422,
            '予約リクエストを送るには、本人確認・年齢確認の承認を完了してください。'
        );
    }

    public function assertCanAccept(Booking $booking, int $bufferBeforeMinutes, int $bufferAfterMinutes): void
    {
        if ($booking->is_on_demand) {
            return;
        }

        $currentWindow = $this->scheduledWindowForBooking(
            $booking,
            $bufferBeforeMinutes,
            $bufferAfterMinutes,
        );

        if ($this->hasActiveOnDemandBooking($booking->therapist_profile_id, $booking->id)
            && $currentWindow['scheduled_start_at']->lt(CarbonImmutable::now()->addHours(6))) {
            abort(409, '今すぐ予約への対応中のため、6時間以内の予約リクエストは承認できません。');
        }

        $conflictExists = Booking::query()
            ->where('therapist_profile_id', $booking->therapist_profile_id)
            ->whereKeyNot($booking->id)
            ->where('is_on_demand', false)
            ->whereIn('status', self::BLOCKING_SCHEDULED_BOOKING_STATUSES)
            ->get()
            ->contains(fn (Booking $otherBooking): bool => $this->windowsOverlap(
                $currentWindow,
                $this->scheduledWindowForBooking($otherBooking),
            ));

        abort_if(
            $conflictExists,
            409,
            '移動・準備時間を含めると、ほかの予約と重なってしまいます。'
        );
    }

    /**
     * @return array{scheduled_start_at: CarbonImmutable, start_at: CarbonImmutable, end_at: CarbonImmutable}
     */
    public function scheduledWindowForBooking(
        Booking $booking,
        ?int $bufferBeforeMinutes = null,
        ?int $bufferAfterMinutes = null,
    ): array {
        $scheduledStartAt = $booking->scheduled_start_at
            ? CarbonImmutable::instance($booking->scheduled_start_at)
            : CarbonImmutable::instance($booking->requested_start_at);
        $scheduledEndAt = $booking->scheduled_end_at
            ? CarbonImmutable::instance($booking->scheduled_end_at)
            : $scheduledStartAt->addMinutes($booking->duration_minutes);

        $bufferBeforeMinutes ??= $booking->buffer_before_minutes ?? 0;
        $bufferAfterMinutes ??= $booking->buffer_after_minutes ?? 0;

        if (in_array($booking->status, self::PENDING_REQUEST_STATUSES, true)) {
            $bufferBeforeMinutes = $bufferBeforeMinutes ?? 0;
            $bufferAfterMinutes = $bufferAfterMinutes ?? 0;
        }

        return [
            'scheduled_start_at' => $scheduledStartAt,
            'start_at' => $scheduledStartAt->subMinutes($bufferBeforeMinutes),
            'end_at' => $scheduledEndAt->addMinutes($bufferAfterMinutes),
        ];
    }

    private function hasActiveOnDemandBooking(int $therapistProfileId, ?int $ignoreBookingId = null): bool
    {
        return Booking::query()
            ->when($ignoreBookingId, fn ($query) => $query->whereKeyNot($ignoreBookingId))
            ->where('therapist_profile_id', $therapistProfileId)
            ->where('is_on_demand', true)
            ->whereIn('status', self::ACTIVE_ON_DEMAND_BOOKING_STATUSES)
            ->exists();
    }

    /**
     * @param  array{start_at: CarbonImmutable, end_at: CarbonImmutable}  $left
     * @param  array{start_at: CarbonImmutable, end_at: CarbonImmutable}  $right
     */
    private function windowsOverlap(array $left, array $right): bool
    {
        return $left['start_at']->lt($right['end_at']) && $left['end_at']->gt($right['start_at']);
    }
}
