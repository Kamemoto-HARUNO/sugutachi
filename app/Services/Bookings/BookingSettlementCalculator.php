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

        $roundedQuarterHours = (int) floor($diffInSeconds / (self::BILLING_STEP_MINUTES * 60));

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
            throw new RuntimeException('現在の見積もりが見つかりません。');
        }

        return $this->calculateFromQuote($booking->currentQuote, $durationMinutes);
    }

    public function applyAuthorizationCap(Booking $booking, array $settlementAmounts): array
    {
        $booking->loadMissing(['currentQuote', 'currentPaymentIntent']);

        $settlementTotalAmount = (int) $settlementAmounts['total_amount'];
        $authorizedAmount = (int) ($booking->currentPaymentIntent?->amount ?? 0);

        $baseAttributes = [
            'settlement_total_amount' => $settlementTotalAmount,
            'settlement_therapist_net_amount' => (int) $settlementAmounts['therapist_net_amount'],
            'settlement_platform_fee_amount' => (int) $settlementAmounts['platform_fee_amount'],
            'settlement_matching_fee_amount' => (int) $settlementAmounts['matching_fee_amount'],
            'uncaptured_extension_amount' => 0,
            'total_amount' => $settlementTotalAmount,
            'therapist_net_amount' => (int) $settlementAmounts['therapist_net_amount'],
            'platform_fee_amount' => (int) $settlementAmounts['platform_fee_amount'],
            'matching_fee_amount' => (int) $settlementAmounts['matching_fee_amount'],
        ];

        if ($authorizedAmount <= 0 || $settlementTotalAmount <= $authorizedAmount) {
            return $baseAttributes;
        }

        $chargeableAmounts = $this->legacyChargeableAmounts(
            booking: $booking,
            authorizedAmount: $authorizedAmount,
            settlementAmounts: $settlementAmounts,
        );

        return [
            ...$baseAttributes,
            ...$chargeableAmounts,
            'uncaptured_extension_amount' => max(0, $settlementTotalAmount - $authorizedAmount),
        ];
    }

    private function legacyChargeableAmounts(
        Booking $booking,
        int $authorizedAmount,
        array $settlementAmounts,
    ): array {
        $quote = $booking->currentQuote;

        if ($quote && (int) $quote->total_amount === $authorizedAmount) {
            return [
                'total_amount' => $authorizedAmount,
                'therapist_net_amount' => (int) $quote->therapist_net_amount,
                'platform_fee_amount' => (int) $quote->platform_fee_amount,
                'matching_fee_amount' => (int) $quote->matching_fee_amount,
            ];
        }

        $applicationFeeAmount = (int) ($booking->currentPaymentIntent?->application_fee_amount ?? 0);
        $transferAmount = (int) ($booking->currentPaymentIntent?->transfer_amount ?? 0);

        if ($applicationFeeAmount + $transferAmount === $authorizedAmount && ($applicationFeeAmount > 0 || $transferAmount > 0)) {
            $matchingFeeAmount = min(
                (int) ($quote?->matching_fee_amount ?? $settlementAmounts['matching_fee_amount']),
                $applicationFeeAmount,
            );

            return [
                'total_amount' => $authorizedAmount,
                'therapist_net_amount' => $transferAmount,
                'platform_fee_amount' => max(0, $applicationFeeAmount - $matchingFeeAmount),
                'matching_fee_amount' => $matchingFeeAmount,
            ];
        }

        $matchingFeeAmount = min((int) $settlementAmounts['matching_fee_amount'], $authorizedAmount);
        $remainingGrossAmount = max(0, $authorizedAmount - $matchingFeeAmount);
        $settlementGrossAmount = max(
            0,
            (int) $settlementAmounts['therapist_net_amount'] + (int) $settlementAmounts['platform_fee_amount'],
        );

        if ($settlementGrossAmount === 0) {
            return [
                'total_amount' => $authorizedAmount,
                'therapist_net_amount' => $remainingGrossAmount,
                'platform_fee_amount' => 0,
                'matching_fee_amount' => $matchingFeeAmount,
            ];
        }

        $platformFeeRatio = (int) $settlementAmounts['platform_fee_amount'] / $settlementGrossAmount;
        $platformFeeAmount = min($remainingGrossAmount, (int) round($remainingGrossAmount * $platformFeeRatio));

        return [
            'total_amount' => $authorizedAmount,
            'therapist_net_amount' => max(0, $remainingGrossAmount - $platformFeeAmount),
            'platform_fee_amount' => $platformFeeAmount,
            'matching_fee_amount' => $matchingFeeAmount,
        ];
    }
}
