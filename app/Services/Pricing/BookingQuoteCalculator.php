<?php

namespace App\Services\Pricing;

use App\Models\ServiceAddress;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Carbon\CarbonImmutable;

class BookingQuoteCalculator
{
    public const MATCHING_FEE_AMOUNT = 300;

    public const PLATFORM_FEE_RATE = 0.10;

    public function calculate(
        TherapistProfile $therapistProfile,
        TherapistMenu $menu,
        ServiceAddress $serviceAddress,
        int $durationMinutes,
        bool $isOnDemand,
        ?string $requestedStartAt,
    ): array {
        $walking = $this->walkingEstimate($therapistProfile, $serviceAddress);
        $baseAmount = (int) round($menu->base_price_amount * $durationMinutes / $menu->duration_minutes);
        $nightFeeAmount = $this->nightFeeAmount($requestedStartAt);
        $travelFeeAmount = $this->travelFeeAmount($walking['walking_time_minutes']);
        $demandFeeAmount = 0;
        $profileAdjustmentAmount = 0;

        $therapistGrossAmount = max(0, $baseAmount + $travelFeeAmount + $nightFeeAmount + $demandFeeAmount + $profileAdjustmentAmount);
        $platformFeeAmount = (int) round($therapistGrossAmount * self::PLATFORM_FEE_RATE);
        $therapistNetAmount = max(0, $therapistGrossAmount - $platformFeeAmount);
        $totalAmount = $therapistGrossAmount + self::MATCHING_FEE_AMOUNT;

        return [
            'duration_minutes' => $durationMinutes,
            'base_amount' => $baseAmount,
            'travel_fee_amount' => $travelFeeAmount,
            'night_fee_amount' => $nightFeeAmount,
            'demand_fee_amount' => $demandFeeAmount,
            'profile_adjustment_amount' => $profileAdjustmentAmount,
            'matching_fee_amount' => self::MATCHING_FEE_AMOUNT,
            'platform_fee_amount' => $platformFeeAmount,
            'total_amount' => $totalAmount,
            'therapist_gross_amount' => $therapistGrossAmount,
            'therapist_net_amount' => $therapistNetAmount,
            'walking_time_minutes' => $walking['walking_time_minutes'],
            'walking_time_range' => $walking['walking_time_range'],
            'input_snapshot_json' => [
                'therapist_profile_id' => $therapistProfile->public_id,
                'therapist_menu_id' => $menu->public_id,
                'service_address_id' => $serviceAddress->public_id,
                'duration_minutes' => $durationMinutes,
                'is_on_demand' => $isOnDemand,
                'requested_start_at' => $requestedStartAt,
                'walking_time_minutes' => $walking['walking_time_minutes'],
                'walking_time_range' => $walking['walking_time_range'],
            ],
            'applied_rules_json' => [
                'matching_fee_amount' => self::MATCHING_FEE_AMOUNT,
                'platform_fee_rate' => self::PLATFORM_FEE_RATE,
                'travel_fee_amount' => $travelFeeAmount,
                'night_fee_amount' => $nightFeeAmount,
            ],
        ];
    }

    private function walkingEstimate(TherapistProfile $therapistProfile, ServiceAddress $serviceAddress): array
    {
        $location = $therapistProfile->location;

        if (! $location) {
            return [
                'walking_time_minutes' => null,
                'walking_time_range' => 'unknown',
            ];
        }

        $straightDistanceKm = $this->haversineKm(
            (float) $location->lat,
            (float) $location->lng,
            (float) $serviceAddress->lat,
            (float) $serviceAddress->lng,
        );

        $walkingDistanceKm = $straightDistanceKm * 1.3;
        $minutes = (int) ceil($walkingDistanceKm / 4.0 * 60);

        return [
            'walking_time_minutes' => $minutes,
            'walking_time_range' => match (true) {
                $minutes <= 15 => 'within_15_min',
                $minutes <= 30 => 'within_30_min',
                $minutes <= 60 => 'within_60_min',
                default => 'outside_area',
            },
        ];
    }

    private function haversineKm(float $fromLat, float $fromLng, float $toLat, float $toLng): float
    {
        $earthRadiusKm = 6371.0;
        $latDelta = deg2rad($toLat - $fromLat);
        $lngDelta = deg2rad($toLng - $fromLng);

        $a = sin($latDelta / 2) ** 2
            + cos(deg2rad($fromLat)) * cos(deg2rad($toLat)) * sin($lngDelta / 2) ** 2;

        return $earthRadiusKm * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }

    private function nightFeeAmount(?string $requestedStartAt): int
    {
        if (! $requestedStartAt) {
            return 0;
        }

        $hour = CarbonImmutable::parse($requestedStartAt)->hour;

        return $hour >= 22 || $hour < 6 ? 1000 : 0;
    }

    private function travelFeeAmount(?int $walkingTimeMinutes): int
    {
        return match (true) {
            $walkingTimeMinutes === null => 0,
            $walkingTimeMinutes <= 30 => 0,
            $walkingTimeMinutes <= 60 => 1000,
            default => 2000,
        };
    }
}
