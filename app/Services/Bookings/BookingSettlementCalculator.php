<?php

namespace App\Services\Bookings;

use App\Models\Booking;
use App\Models\BookingQuote;
use App\Services\Pricing\BookingQuoteCalculator;
use Carbon\CarbonImmutable;
use RuntimeException;

class BookingSettlementCalculator
{
    public const AUTHORIZATION_EXTENSION_MINUTES = 60;

    public const BILLING_STEP_MINUTES = 15;

    public const MINIMUM_BILLABLE_MINUTES = 15;

    public function authorizationDurationMinutes(int $requestedDurationMinutes): int
    {
        return max(self::MINIMUM_BILLABLE_MINUTES, $requestedDurationMinutes + self::AUTHORIZATION_EXTENSION_MINUTES);
    }

    public function roundedDurationMinutes(CarbonImmutable $startedAt, CarbonImmutable $endedAt): int
    {
        $diffInSeconds = $endedAt->getTimestamp() - $startedAt->getTimestamp();

        if ($diffInSeconds <= 0) {
            return 0;
        }

        $roundedQuarterHours = (int) ceil($diffInSeconds / (self::BILLING_STEP_MINUTES * 60));

        return max(self::MINIMUM_BILLABLE_MINUTES, $roundedQuarterHours * self::BILLING_STEP_MINUTES);
    }

    public function calculateFromQuote(BookingQuote $quote, int $durationMinutes): array
    {
        $quotedDurationMinutes = max(1, (int) $quote->duration_minutes);
        $baseAmount = (int) round(((int) $quote->base_amount) * ($durationMinutes / $quotedDurationMinutes));
        $travelFeeAmount = (int) $quote->travel_fee_amount;
        $nightFeeAmount = (int) $quote->night_fee_amount;
        $demandFeeAmount = (int) $quote->demand_fee_amount;
        $profileAdjustmentAmount = (int) $quote->profile_adjustment_amount;
        $matchingFeeAmount = (int) $quote->matching_fee_amount;

        $therapistGrossAmount = max(0, $baseAmount + $travelFeeAmount + $nightFeeAmount + $demandFeeAmount + $profileAdjustmentAmount);
        $platformFeeAmount = (int) round($therapistGrossAmount * BookingQuoteCalculator::PLATFORM_FEE_RATE);
        $therapistNetAmount = max(0, $therapistGrossAmount - $platformFeeAmount);
        $totalAmount = $therapistGrossAmount + $matchingFeeAmount;

        return [
            'duration_minutes' => $durationMinutes,
            'base_amount' => $baseAmount,
            'travel_fee_amount' => $travelFeeAmount,
            'night_fee_amount' => $nightFeeAmount,
            'demand_fee_amount' => $demandFeeAmount,
            'profile_adjustment_amount' => $profileAdjustmentAmount,
            'matching_fee_amount' => $matchingFeeAmount,
            'platform_fee_amount' => $platformFeeAmount,
            'therapist_gross_amount' => $therapistGrossAmount,
            'therapist_net_amount' => $therapistNetAmount,
            'total_amount' => $totalAmount,
        ];
    }

    public function calculateAuthorizationAmounts(BookingQuote $quote): array
    {
        $authorizationDurationMinutes = $this->authorizationDurationMinutes((int) $quote->duration_minutes);

        return [
            ...$this->calculateFromQuote($quote, $authorizationDurationMinutes),
            'authorization_duration_minutes' => $authorizationDurationMinutes,
        ];
    }

    public function calculateForBooking(Booking $booking, int $durationMinutes): array
    {
        $booking->loadMissing('currentQuote');

        if (! $booking->currentQuote) {
            throw new RuntimeException('Current quote is missing.');
        }

        return $this->calculateFromQuote($booking->currentQuote, $durationMinutes);
    }
}
