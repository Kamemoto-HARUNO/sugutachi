<?php

namespace App\Services\Campaigns;

use App\Models\Campaign;

class CampaignBenefitCalculator
{
    public function actualDiscountAmount(
        int $preDiscountTotalAmount,
        int $platformFeeAmount,
        int $matchingFeeAmount,
        string $benefitType,
        int $benefitValue,
    ): int {
        $requestedDiscountAmount = $this->requestedDiscountAmount(
            preDiscountTotalAmount: $preDiscountTotalAmount,
            benefitType: $benefitType,
            benefitValue: $benefitValue,
        );

        return max(0, min(
            $requestedDiscountAmount,
            max(0, $preDiscountTotalAmount),
        ));
    }

    public function applyDiscount(
        int $therapistNetAmount,
        int $platformFeeAmount,
        int $matchingFeeAmount,
        int $preDiscountTotalAmount,
        ?array $discountSnapshot = null,
    ): array {
        if (! $discountSnapshot) {
            return [
                'discount_amount' => 0,
                'discounted_platform_fee_amount' => $platformFeeAmount,
                'discounted_matching_fee_amount' => $matchingFeeAmount,
                'total_amount' => $preDiscountTotalAmount,
            ];
        }

        $discountAmount = $this->actualDiscountAmount(
            preDiscountTotalAmount: $preDiscountTotalAmount,
            platformFeeAmount: $platformFeeAmount,
            matchingFeeAmount: $matchingFeeAmount,
            benefitType: (string) ($discountSnapshot['benefit_type'] ?? Campaign::BENEFIT_TYPE_FIXED_AMOUNT),
            benefitValue: (int) ($discountSnapshot['benefit_value'] ?? 0),
        );

        return [
            'discount_amount' => $discountAmount,
            'discounted_platform_fee_amount' => $platformFeeAmount,
            'discounted_matching_fee_amount' => $matchingFeeAmount,
            'total_amount' => max(0, $preDiscountTotalAmount - $discountAmount),
        ];
    }

    public function requestedDiscountAmount(
        int $preDiscountTotalAmount,
        string $benefitType,
        int $benefitValue,
    ): int {
        return match ($benefitType) {
            Campaign::BENEFIT_TYPE_PERCENTAGE => (int) round($preDiscountTotalAmount * ($benefitValue / 100)),
            default => max(0, $benefitValue),
        };
    }
}
