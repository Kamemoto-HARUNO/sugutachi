<?php

namespace App\Services\Pricing;

use App\Models\Booking;
use App\Models\ServiceAddress;
use App\Models\TherapistBookingSetting;
use App\Models\TherapistMenu;
use App\Models\TherapistPricingRule;
use App\Models\TherapistProfile;
use Carbon\CarbonImmutable;

class BookingQuoteCalculator
{
    public const MATCHING_FEE_AMOUNT = 300;

    public const PLATFORM_FEE_RATE = 0.10;

    private const TRAVEL_MODE_PROFILES = [
        TherapistBookingSetting::TRAVEL_MODE_WALKING => ['speed_kmh' => 4.0, 'route_factor' => 1.3, 'fixed_minutes' => 0],
        TherapistBookingSetting::TRAVEL_MODE_BICYCLE => ['speed_kmh' => 12.0, 'route_factor' => 1.15, 'fixed_minutes' => 0],
        TherapistBookingSetting::TRAVEL_MODE_TRANSIT => ['speed_kmh' => 18.0, 'route_factor' => 1.35, 'fixed_minutes' => 10],
        TherapistBookingSetting::TRAVEL_MODE_CAR => ['speed_kmh' => 30.0, 'route_factor' => 1.2, 'fixed_minutes' => 5],
    ];

    public function __construct(
        private readonly TherapistPricingRuleEvaluator $pricingRuleEvaluator,
    ) {}

    public function calculate(
        TherapistProfile $therapistProfile,
        TherapistMenu $menu,
        ServiceAddress $serviceAddress,
        int $durationMinutes,
        bool $isOnDemand,
        ?string $requestedStartAt,
        ?float $originLat = null,
        ?float $originLng = null,
    ): array {
        $walking = $this->walkingEstimate($therapistProfile, $serviceAddress, $originLat, $originLng);
        $baseAmount = (int) round($menu->hourly_rate_amount * $durationMinutes / 60);
        $nightFeeAmount = $this->nightFeeAmount($requestedStartAt);
        $travelFeeAmount = $this->travelFeeAmount($walking['walking_time_minutes']);
        $pricingRuleResult = $this->pricingRuleResult(
            therapistProfile: $therapistProfile,
            menu: $menu,
            serviceAddress: $serviceAddress,
            baseAmount: $baseAmount,
            walking: $walking,
            isOnDemand: $isOnDemand,
            requestedStartAt: $requestedStartAt,
        );
        $demandFeeAmount = $pricingRuleResult['demand_fee_amount'];
        $profileAdjustmentAmount = $pricingRuleResult['profile_adjustment_amount'];

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
                'user_profile_attributes' => $pricingRuleResult['input_snapshot']['user_profile_attributes'] ?? [],
                'pricing_rule_context' => $pricingRuleResult['input_snapshot']['pricing_context'] ?? [],
            ],
            'applied_rules_json' => [
                'matching_fee_amount' => self::MATCHING_FEE_AMOUNT,
                'platform_fee_rate' => self::PLATFORM_FEE_RATE,
                'travel_fee_amount' => $travelFeeAmount,
                'night_fee_amount' => $nightFeeAmount,
                'demand_fee_amount' => $demandFeeAmount,
                'pricing_rules' => $pricingRuleResult['applied_rules'],
            ],
        ];
    }

    public function walkingEstimateFromCoordinates(
        float $fromLat,
        float $fromLng,
        float $toLat,
        float $toLng,
        string $travelMode = TherapistBookingSetting::TRAVEL_MODE_WALKING,
        int $maxTravelMinutes = 120,
    ): array {
        $straightDistanceKm = $this->haversineKm(
            $fromLat,
            $fromLng,
            $toLat,
            $toLng,
        );

        $profile = self::TRAVEL_MODE_PROFILES[$travelMode] ?? self::TRAVEL_MODE_PROFILES[TherapistBookingSetting::TRAVEL_MODE_WALKING];
        $routeDistanceKm = $straightDistanceKm * $profile['route_factor'];
        $minutes = (int) ceil(($routeDistanceKm / $profile['speed_kmh']) * 60 + $profile['fixed_minutes']);

        return [
            'walking_time_minutes' => $minutes,
            'walking_time_range' => $this->travelTimeRangeFromMinutes($minutes, $maxTravelMinutes),
        ];
    }

    private function walkingEstimate(
        TherapistProfile $therapistProfile,
        ServiceAddress $serviceAddress,
        ?float $originLat = null,
        ?float $originLng = null,
    ): array {
        $bookingSetting = $therapistProfile->relationLoaded('bookingSetting')
            ? $therapistProfile->bookingSetting
            : $therapistProfile->bookingSetting()->first();
        $travelMode = $bookingSetting?->travel_mode ?: TherapistBookingSetting::TRAVEL_MODE_WALKING;
        $maxTravelMinutes = $bookingSetting?->max_travel_minutes ?: 120;

        if ($originLat !== null && $originLng !== null) {
            return $this->walkingEstimateFromCoordinates(
                $originLat,
                $originLng,
                (float) $serviceAddress->lat,
                (float) $serviceAddress->lng,
                $travelMode,
                $maxTravelMinutes,
            );
        }

        $location = $therapistProfile->location;

        if (! $location) {
            return [
                'walking_time_minutes' => null,
                'walking_time_range' => 'unknown',
            ];
        }

        return $this->walkingEstimateFromCoordinates(
            (float) $location->lat,
            (float) $location->lng,
            (float) $serviceAddress->lat,
            (float) $serviceAddress->lng,
            $travelMode,
            $maxTravelMinutes,
        );
    }

    public function travelTimeRangeFromMinutes(int $minutes, int $maxTravelMinutes): string
    {
        if ($minutes > $maxTravelMinutes) {
            return 'outside_area';
        }

        $bucketMinutes = max(15, (int) ceil($minutes / 15) * 15);

        return "within_{$bucketMinutes}_min";
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

    private function pricingRuleResult(
        TherapistProfile $therapistProfile,
        TherapistMenu $menu,
        ServiceAddress $serviceAddress,
        int $baseAmount,
        array $walking,
        bool $isOnDemand,
        ?string $requestedStartAt,
    ): array {
        $therapistProfile->loadMissing('pricingRules');
        $serviceAddress->loadMissing('account.userProfile');

        $context = [
            'requested_hour' => $this->effectiveRequestedAt($requestedStartAt, $isOnDemand)?->hour,
            'walking_time_range' => $walking['walking_time_range'],
            'demand_level' => $this->demandLevel($therapistProfile, $menu, $isOnDemand),
        ];

        return $this->pricingRuleEvaluator->evaluate(
            therapistProfile: $therapistProfile,
            menu: $menu,
            userProfile: $serviceAddress->account?->userProfile,
            baseAmount: $baseAmount,
            context: $context,
        );
    }

    private function effectiveRequestedAt(?string $requestedStartAt, bool $isOnDemand): ?CarbonImmutable
    {
        if ($requestedStartAt) {
            return CarbonImmutable::parse($requestedStartAt);
        }

        return $isOnDemand ? CarbonImmutable::now() : null;
    }

    private function demandLevel(TherapistProfile $therapistProfile, TherapistMenu $menu, bool $isOnDemand): string
    {
        if (! $isOnDemand) {
            return TherapistPricingRule::DEMAND_LEVEL_NORMAL;
        }

        $hasDemandRules = $therapistProfile->pricingRules
            ->contains(fn (TherapistPricingRule $rule): bool => $rule->is_active
                && $rule->rule_type === TherapistPricingRule::RULE_TYPE_DEMAND_LEVEL
                && ($rule->therapist_menu_id === null || (int) $rule->therapist_menu_id === $menu->id));

        if (! $hasDemandRules) {
            return TherapistPricingRule::DEMAND_LEVEL_NORMAL;
        }

        $activeOnDemandBookingCount = Booking::query()
            ->where('therapist_profile_id', $therapistProfile->id)
            ->where('is_on_demand', true)
            ->whereIn('status', [
                Booking::STATUS_PAYMENT_AUTHORIZING,
                Booking::STATUS_REQUESTED,
                Booking::STATUS_ACCEPTED,
                Booking::STATUS_MOVING,
                Booking::STATUS_ARRIVED,
                Booking::STATUS_IN_PROGRESS,
                Booking::STATUS_THERAPIST_COMPLETED,
            ])
            ->count();

        return match (true) {
            $activeOnDemandBookingCount >= 2 => TherapistPricingRule::DEMAND_LEVEL_PEAK,
            $activeOnDemandBookingCount >= 1 => TherapistPricingRule::DEMAND_LEVEL_BUSY,
            default => TherapistPricingRule::DEMAND_LEVEL_NORMAL,
        };
    }
}
