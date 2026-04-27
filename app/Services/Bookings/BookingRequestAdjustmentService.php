<?php

namespace App\Services\Bookings;

use App\Models\Booking;
use App\Models\TherapistAvailabilitySlot;
use App\Services\Pricing\BookingQuoteCalculator;
use App\Services\Scheduling\PublicAvailabilityWindowCalculator;
use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;

class BookingRequestAdjustmentService
{
    public function __construct(
        private readonly BookingQuoteCalculator $bookingQuoteCalculator,
        private readonly BookingSettlementCalculator $bookingSettlementCalculator,
        private readonly PublicAvailabilityWindowCalculator $availabilityWindowCalculator,
        private readonly ScheduledBookingPolicy $scheduledBookingPolicy,
    ) {}

    public function buildProposal(
        Booking $booking,
        CarbonImmutable $proposedStartAt,
        CarbonImmutable $proposedEndAt,
        int $bufferBeforeMinutes,
        int $bufferAfterMinutes,
    ): array {
        $booking->loadMissing([
            'availabilitySlot',
            'currentQuote',
            'currentPaymentIntent',
            'serviceAddress.account.userProfile',
            'therapistMenu',
            'therapistProfile.location',
            'therapistProfile.bookingSetting',
            'therapistProfile.pricingRules',
        ]);

        if ($booking->is_on_demand) {
            throw ValidationException::withMessages([
                'scheduled_start_at' => ['時間変更の提案は予定予約でのみ利用できます。'],
            ]);
        }

        if (! $booking->availabilitySlot || ! $booking->currentQuote || ! $booking->serviceAddress || ! $booking->therapistMenu || ! $booking->therapistProfile) {
            abort(409, '予約条件の確認に必要なデータが不足しています。');
        }

        $this->scheduledBookingPolicy->assertQuarterHourAligned($proposedStartAt, 'scheduled_start_at');
        $this->scheduledBookingPolicy->assertQuarterHourAligned($proposedEndAt, 'scheduled_end_at');

        if ($proposedEndAt->lessThanOrEqualTo($proposedStartAt)) {
            throw ValidationException::withMessages([
                'scheduled_end_at' => ['終了時刻は開始時刻より後に設定してください。'],
            ]);
        }

        if ($proposedStartAt->lessThan(CarbonImmutable::now())) {
            throw ValidationException::withMessages([
                'scheduled_start_at' => ['開始時刻は現在時刻より後に設定してください。'],
            ]);
        }

        $durationMinutes = $proposedStartAt->diffInMinutes($proposedEndAt);
        $this->scheduledBookingPolicy->assertQuarterHourDuration($durationMinutes);

        if (! $booking->therapistMenu->supportsDuration($durationMinutes)) {
            throw ValidationException::withMessages([
                'duration_minutes' => ['この対応内容で受け付けられる最短時間より短い提案です。'],
            ]);
        }

        $authorizationDurationMinutes = $this->bookingSettlementCalculator->authorizationDurationMinutes((int) $booking->duration_minutes);

        if ($durationMinutes > $authorizationDurationMinutes) {
            throw ValidationException::withMessages([
                'duration_minutes' => ["予約時に確保している上限は {$authorizationDurationMinutes}分 までです。"],
            ]);
        }

        $this->assertFitsAvailabilitySlot($booking, $proposedStartAt, $durationMinutes);
        $this->assertSchedulableWithBuffers($booking, $proposedStartAt, $proposedEndAt, $durationMinutes, $bufferBeforeMinutes, $bufferAfterMinutes);

        [$originLat, $originLng] = $this->dispatchCoordinates($booking);
        $amounts = $this->bookingQuoteCalculator->calculate(
            therapistProfile: $booking->therapistProfile,
            menu: $booking->therapistMenu,
            serviceAddress: $booking->serviceAddress,
            durationMinutes: $durationMinutes,
            isOnDemand: false,
            requestedStartAt: $proposedStartAt->toIso8601String(),
            originLat: $originLat,
            originLng: $originLng,
        );

        $authorizedAmount = (int) ($booking->currentPaymentIntent?->amount ?? 0);

        if ($authorizedAmount > 0 && (int) $amounts['total_amount'] > $authorizedAmount) {
            throw ValidationException::withMessages([
                'duration_minutes' => ['この提案だと事前与信の上限を超えるため、そのまま承認に進めません。'],
            ]);
        }

        return [
            'therapist_adjustment_proposed_at' => now(),
            'therapist_adjustment_start_at' => $proposedStartAt,
            'therapist_adjustment_end_at' => $proposedEndAt,
            'therapist_adjustment_duration_minutes' => $durationMinutes,
            'therapist_adjustment_total_amount' => (int) $amounts['total_amount'],
            'therapist_adjustment_therapist_net_amount' => (int) $amounts['therapist_net_amount'],
            'therapist_adjustment_platform_fee_amount' => (int) $amounts['platform_fee_amount'],
            'therapist_adjustment_matching_fee_amount' => (int) $amounts['matching_fee_amount'],
            'therapist_adjustment_buffer_before_minutes' => $bufferBeforeMinutes,
            'therapist_adjustment_buffer_after_minutes' => $bufferAfterMinutes,
            'request_expires_at' => $this->scheduledBookingPolicy->requestExpiresAt(
                bookingSetting: $booking->therapistProfile->bookingSetting,
                requestedStartAt: $proposedStartAt,
            ),
        ];
    }

    public function acceptedProposalAttributes(Booking $booking): array
    {
        $booking->loadMissing(['currentPaymentIntent']);

        if (! $booking->hasPendingTherapistAdjustment()) {
            abort(409, 'この予約には利用者確認待ちの時間変更提案がありません。');
        }

        $proposedStartAt = CarbonImmutable::instance($booking->therapist_adjustment_start_at);
        $proposedEndAt = CarbonImmutable::instance($booking->therapist_adjustment_end_at);
        $durationMinutes = (int) $booking->therapist_adjustment_duration_minutes;
        $bufferBeforeMinutes = (int) ($booking->therapist_adjustment_buffer_before_minutes ?? 0);
        $bufferAfterMinutes = (int) ($booking->therapist_adjustment_buffer_after_minutes ?? 0);

        $this->assertFitsAvailabilitySlot($booking, $proposedStartAt, $durationMinutes);
        $this->assertSchedulableWithBuffers($booking, $proposedStartAt, $proposedEndAt, $durationMinutes, $bufferBeforeMinutes, $bufferAfterMinutes);

        return [
            'accepted_at' => now(),
            'confirmed_at' => now(),
            'scheduled_start_at' => $proposedStartAt,
            'scheduled_end_at' => $proposedEndAt,
            'duration_minutes' => $durationMinutes,
            'buffer_before_minutes' => $bufferBeforeMinutes,
            'buffer_after_minutes' => $bufferAfterMinutes,
            'request_expires_at' => null,
            'total_amount' => (int) $booking->therapist_adjustment_total_amount,
            'therapist_net_amount' => (int) $booking->therapist_adjustment_therapist_net_amount,
            'platform_fee_amount' => (int) $booking->therapist_adjustment_platform_fee_amount,
            'matching_fee_amount' => (int) $booking->therapist_adjustment_matching_fee_amount,
            'therapist_adjustment_proposed_at' => null,
            'therapist_adjustment_start_at' => null,
            'therapist_adjustment_end_at' => null,
            'therapist_adjustment_duration_minutes' => null,
            'therapist_adjustment_total_amount' => null,
            'therapist_adjustment_therapist_net_amount' => null,
            'therapist_adjustment_platform_fee_amount' => null,
            'therapist_adjustment_matching_fee_amount' => null,
            'therapist_adjustment_buffer_before_minutes' => null,
            'therapist_adjustment_buffer_after_minutes' => null,
        ];
    }

    public function clearProposalAttributes(): array
    {
        return [
            'therapist_adjustment_proposed_at' => null,
            'therapist_adjustment_start_at' => null,
            'therapist_adjustment_end_at' => null,
            'therapist_adjustment_duration_minutes' => null,
            'therapist_adjustment_total_amount' => null,
            'therapist_adjustment_therapist_net_amount' => null,
            'therapist_adjustment_platform_fee_amount' => null,
            'therapist_adjustment_matching_fee_amount' => null,
            'therapist_adjustment_buffer_before_minutes' => null,
            'therapist_adjustment_buffer_after_minutes' => null,
        ];
    }

    private function assertFitsAvailabilitySlot(Booking $booking, CarbonImmutable $proposedStartAt, int $durationMinutes): void
    {
        /** @var TherapistAvailabilitySlot $slot */
        $slot = $booking->availabilitySlot;
        $slotStartAt = CarbonImmutable::instance($slot->start_at);
        $slotEndAt = CarbonImmutable::instance($slot->end_at);
        $proposedEndAt = $proposedStartAt->addMinutes($durationMinutes);

        if ($proposedStartAt->lt($slotStartAt) || $proposedEndAt->gt($slotEndAt)) {
            throw ValidationException::withMessages([
                'scheduled_start_at' => ['この公開枠の中で対応できる時間だけ提案できます。'],
            ]);
        }

        $availability = $this->availabilityWindowCalculator->calculate(
            profile: $booking->therapistProfile,
            menu: $booking->therapistMenu,
            serviceAddress: $booking->serviceAddress,
            date: $proposedStartAt->startOfDay(),
            requestedDurationMinutes: $durationMinutes,
            excludeBookingId: $booking->id,
        );

        $matchingWindow = collect($availability['windows'])
            ->first(fn (array $window): bool => $window['availability_slot_id'] === $slot->public_id
                && ($window['is_bookable'] ?? true)
                && CarbonImmutable::instance($window['start_at'])->lte($proposedStartAt)
                && CarbonImmutable::instance($window['end_at'])->gte($proposedEndAt));

        if (! $matchingWindow) {
            throw ValidationException::withMessages([
                'scheduled_start_at' => ['その時間帯はもう公開枠として予約を受けられません。'],
            ]);
        }
    }

    private function assertSchedulableWithBuffers(
        Booking $booking,
        CarbonImmutable $proposedStartAt,
        CarbonImmutable $proposedEndAt,
        int $durationMinutes,
        int $bufferBeforeMinutes,
        int $bufferAfterMinutes,
    ): void {
        $candidate = new Booking();
        $candidate->id = $booking->id;
        $candidate->therapist_profile_id = $booking->therapist_profile_id;
        $candidate->is_on_demand = false;
        $candidate->status = Booking::STATUS_REQUESTED;
        $candidate->requested_start_at = $proposedStartAt;
        $candidate->scheduled_start_at = $proposedStartAt;
        $candidate->scheduled_end_at = $proposedEndAt;
        $candidate->duration_minutes = $durationMinutes;
        $candidate->buffer_before_minutes = $bufferBeforeMinutes;
        $candidate->buffer_after_minutes = $bufferAfterMinutes;

        $this->scheduledBookingPolicy->assertCanAccept(
            booking: $candidate,
            bufferBeforeMinutes: $bufferBeforeMinutes,
            bufferAfterMinutes: $bufferAfterMinutes,
        );
    }

    /**
     * @return array{0: float, 1: float}
     */
    private function dispatchCoordinates(Booking $booking): array
    {
        /** @var TherapistAvailabilitySlot $slot */
        $slot = $booking->availabilitySlot;

        if ($slot->dispatch_base_type === TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_CUSTOM) {
            return [
                (float) $slot->custom_dispatch_base_lat,
                (float) $slot->custom_dispatch_base_lng,
            ];
        }

        return [
            (float) $booking->therapistProfile->bookingSetting->scheduled_base_lat,
            (float) $booking->therapistProfile->bookingSetting->scheduled_base_lng,
        ];
    }
}
