<?php

namespace App\Services\Scheduling;

use App\Models\Booking;
use App\Models\ServiceAddress;
use App\Models\TherapistAvailabilitySlot;
use App\Models\TherapistBookingSetting;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use App\Services\Pricing\BookingQuoteCalculator;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

class PublicAvailabilityWindowCalculator
{
    private const BLOCKING_SCHEDULED_BOOKING_STATUSES = [
        Booking::STATUS_PAYMENT_AUTHORIZING,
        Booking::STATUS_REQUESTED,
        Booking::STATUS_ACCEPTED,
        Booking::STATUS_MOVING,
        Booking::STATUS_ARRIVED,
        Booking::STATUS_IN_PROGRESS,
        Booking::STATUS_THERAPIST_COMPLETED,
        Booking::STATUS_COMPLETED,
    ];

    private const ACTIVE_ON_DEMAND_BOOKING_STATUSES = [
        Booking::STATUS_PAYMENT_AUTHORIZING,
        Booking::STATUS_REQUESTED,
        Booking::STATUS_ACCEPTED,
        Booking::STATUS_MOVING,
        Booking::STATUS_ARRIVED,
        Booking::STATUS_IN_PROGRESS,
        Booking::STATUS_THERAPIST_COMPLETED,
    ];

    public function __construct(
        private readonly BookingQuoteCalculator $calculator,
    ) {}

    public function calculate(
        TherapistProfile $profile,
        TherapistMenu $menu,
        ServiceAddress $serviceAddress,
        CarbonImmutable $date,
    ): array {
        /** @var TherapistBookingSetting $bookingSetting */
        $bookingSetting = $profile->bookingSetting;

        $startOfDay = $date->startOfDay();
        $endOfDay = $date->endOfDay();
        $leadTimeMinutes = $bookingSetting->booking_request_lead_time_minutes;
        $now = CarbonImmutable::now();
        $roundedNow = $this->roundUpToQuarter($now);
        $leadStart = $this->roundUpToQuarter($now->addMinutes($leadTimeMinutes));
        $onDemandBlockedUntil = $this->hasActiveOnDemandBooking($profile)
            ? $this->roundUpToQuarter($now->addHours(6))
            : null;

        $slots = $profile->availabilitySlots()
            ->where('status', TherapistAvailabilitySlot::STATUS_PUBLISHED)
            ->where('start_at', '<=', $endOfDay)
            ->where('end_at', '>=', $startOfDay)
            ->orderBy('start_at')
            ->get();

        $blockingBookings = Booking::query()
            ->where('therapist_profile_id', $profile->id)
            ->where('is_on_demand', false)
            ->whereIn('status', self::BLOCKING_SCHEDULED_BOOKING_STATUSES)
            ->where(function ($query) use ($endOfDay): void {
                $query
                    ->where(function ($query) use ($endOfDay): void {
                        $query
                            ->whereNotNull('requested_start_at')
                            ->where('requested_start_at', '<', $endOfDay);
                    })
                    ->orWhere(function ($query): void {
                        $query->whereNotNull('scheduled_end_at');
                    });
            })
            ->get();

        $windows = collect();
        $minAmount = null;
        $maxAmount = null;
        $bestWalkingMinutes = null;

        foreach ($slots as $slot) {
            $dispatchBase = $this->dispatchBaseForSlot($slot, $bookingSetting);

            if (! $dispatchBase) {
                continue;
            }

            $intervalStart = $this->maxTime([
                CarbonImmutable::instance($slot->start_at),
                $startOfDay,
                $roundedNow,
                $leadStart,
            ]);
            $intervalEnd = $this->minTime([
                CarbonImmutable::instance($slot->end_at),
                $endOfDay,
            ]);

            if ($onDemandBlockedUntil !== null) {
                $intervalStart = $this->maxTime([$intervalStart, $onDemandBlockedUntil]);
            }

            if ($intervalStart->greaterThanOrEqualTo($intervalEnd)) {
                continue;
            }

            $walking = $this->calculator->walkingEstimateFromCoordinates(
                $dispatchBase['lat'],
                $dispatchBase['lng'],
                (float) $serviceAddress->lat,
                (float) $serviceAddress->lng,
            );

            if ($walking['walking_time_range'] === 'outside_area') {
                continue;
            }

            $freeIntervals = $this->subtractBlockingIntervals(
                startAt: $intervalStart,
                endAt: $intervalEnd,
                blockingIntervals: $this->blockingIntervalsForSlot($blockingBookings, $slot),
            );

            foreach ($freeIntervals as $freeInterval) {
                [$freeStart, $freeEnd] = $freeInterval;

                if ($freeStart->diffInMinutes($freeEnd) < $menu->duration_minutes) {
                    continue;
                }

                $windowRange = $this->windowAmountRange(
                    profile: $profile,
                    menu: $menu,
                    serviceAddress: $serviceAddress,
                    freeStart: $freeStart,
                    freeEnd: $freeEnd,
                    originLat: $dispatchBase['lat'],
                    originLng: $dispatchBase['lng'],
                );

                if (! $windowRange) {
                    continue;
                }

                $minAmount = $minAmount === null ? $windowRange['min'] : min($minAmount, $windowRange['min']);
                $maxAmount = $maxAmount === null ? $windowRange['max'] : max($maxAmount, $windowRange['max']);
                $bestWalkingMinutes = $bestWalkingMinutes === null
                    ? $walking['walking_time_minutes']
                    : min($bestWalkingMinutes, $walking['walking_time_minutes']);

                $windows->push([
                    'start_at' => $freeStart,
                    'end_at' => $freeEnd,
                    'booking_deadline_at' => $freeStart->subMinutes($leadTimeMinutes),
                    'dispatch_area_label' => $slot->dispatch_area_label,
                ]);
            }
        }

        return [
            'date' => $date->toDateString(),
            'walking_time_range' => $bestWalkingMinutes !== null
                ? $this->walkingTimeRangeFromMinutes($bestWalkingMinutes)
                : null,
            'estimated_total_amount_range' => $minAmount !== null && $maxAmount !== null
                ? [
                    'min' => $minAmount,
                    'max' => $maxAmount,
                ]
                : null,
            'windows' => $windows
                ->sortBy('start_at')
                ->values()
                ->all(),
        ];
    }

    private function hasActiveOnDemandBooking(TherapistProfile $profile): bool
    {
        return Booking::query()
            ->where('therapist_profile_id', $profile->id)
            ->where('is_on_demand', true)
            ->whereIn('status', self::ACTIVE_ON_DEMAND_BOOKING_STATUSES)
            ->exists();
    }

    private function dispatchBaseForSlot(
        TherapistAvailabilitySlot $slot,
        TherapistBookingSetting $bookingSetting,
    ): ?array {
        if ($slot->dispatch_base_type === TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_CUSTOM) {
            if ($slot->custom_dispatch_base_lat === null || $slot->custom_dispatch_base_lng === null) {
                return null;
            }

            return [
                'lat' => (float) $slot->custom_dispatch_base_lat,
                'lng' => (float) $slot->custom_dispatch_base_lng,
            ];
        }

        return [
            'lat' => (float) $bookingSetting->scheduled_base_lat,
            'lng' => (float) $bookingSetting->scheduled_base_lng,
        ];
    }

    private function blockingIntervalsForSlot(Collection $bookings, TherapistAvailabilitySlot $slot): Collection
    {
        $slotStart = CarbonImmutable::instance($slot->start_at);
        $slotEnd = CarbonImmutable::instance($slot->end_at);

        return $bookings
            ->map(function (Booking $booking): ?array {
                $startAt = $booking->scheduled_start_at
                    ? CarbonImmutable::instance($booking->scheduled_start_at)
                    : ($booking->requested_start_at ? CarbonImmutable::instance($booking->requested_start_at) : null);

                if (! $startAt) {
                    return null;
                }

                $endAt = $booking->scheduled_end_at
                    ? CarbonImmutable::instance($booking->scheduled_end_at)
                    : $startAt->addMinutes($booking->duration_minutes);

                if (! in_array($booking->status, [
                    Booking::STATUS_PAYMENT_AUTHORIZING,
                    Booking::STATUS_REQUESTED,
                ], true)) {
                    $startAt = $startAt->subMinutes($booking->buffer_before_minutes);
                    $endAt = $endAt->addMinutes($booking->buffer_after_minutes);
                }

                return [
                    'start_at' => $startAt,
                    'end_at' => $endAt,
                ];
            })
            ->filter(fn (?array $interval): bool => $interval !== null)
            ->filter(fn (array $interval): bool => $interval['start_at'] < $slotEnd && $interval['end_at'] > $slotStart)
            ->sortBy('start_at')
            ->values();
    }

    private function subtractBlockingIntervals(
        CarbonImmutable $startAt,
        CarbonImmutable $endAt,
        Collection $blockingIntervals,
    ): Collection {
        $merged = collect();

        foreach ($blockingIntervals as $interval) {
            if ($merged->isEmpty()) {
                $merged->push($interval);

                continue;
            }

            $lastIndex = $merged->keys()->last();
            $last = $merged->get($lastIndex);

            if ($interval['start_at'] <= $last['end_at']) {
                $merged->put($lastIndex, [
                    'start_at' => $last['start_at'],
                    'end_at' => $this->maxTime([$last['end_at'], $interval['end_at']]),
                ]);

                continue;
            }

            $merged->push($interval);
        }

        $freeIntervals = collect();
        $cursor = $startAt;

        foreach ($merged as $interval) {
            $blockedStart = $this->maxTime([$interval['start_at'], $startAt]);
            $blockedEnd = $this->minTime([$interval['end_at'], $endAt]);

            if ($blockedEnd <= $cursor) {
                continue;
            }

            if ($blockedStart > $cursor) {
                $freeIntervals->push([$cursor, $blockedStart]);
            }

            $cursor = $this->maxTime([$cursor, $blockedEnd]);

            if ($cursor >= $endAt) {
                break;
            }
        }

        if ($cursor < $endAt) {
            $freeIntervals->push([$cursor, $endAt]);
        }

        return $freeIntervals;
    }

    private function windowAmountRange(
        TherapistProfile $profile,
        TherapistMenu $menu,
        ServiceAddress $serviceAddress,
        CarbonImmutable $freeStart,
        CarbonImmutable $freeEnd,
        float $originLat,
        float $originLng,
    ): ?array {
        $latestStartAt = $freeEnd->subMinutes($menu->duration_minutes);

        if ($latestStartAt < $freeStart) {
            return null;
        }

        $minAmount = null;
        $maxAmount = null;

        for ($cursor = $freeStart; $cursor <= $latestStartAt; $cursor = $cursor->addMinutes(15)) {
            $estimate = $this->calculator->calculate(
                therapistProfile: $profile,
                menu: $menu,
                serviceAddress: $serviceAddress,
                durationMinutes: $menu->duration_minutes,
                isOnDemand: false,
                requestedStartAt: $cursor->toIso8601String(),
                originLat: $originLat,
                originLng: $originLng,
            );

            if ($estimate['walking_time_range'] === 'outside_area') {
                continue;
            }

            $minAmount = $minAmount === null ? $estimate['total_amount'] : min($minAmount, $estimate['total_amount']);
            $maxAmount = $maxAmount === null ? $estimate['total_amount'] : max($maxAmount, $estimate['total_amount']);
        }

        if ($minAmount === null || $maxAmount === null) {
            return null;
        }

        return [
            'min' => $minAmount,
            'max' => $maxAmount,
        ];
    }

    private function walkingTimeRangeFromMinutes(int $minutes): string
    {
        return match (true) {
            $minutes <= 15 => 'within_15_min',
            $minutes <= 30 => 'within_30_min',
            $minutes <= 60 => 'within_60_min',
            default => 'outside_area',
        };
    }

    private function roundUpToQuarter(CarbonImmutable $time): CarbonImmutable
    {
        if ($time->second === 0 && $time->minute % 15 === 0) {
            return $time;
        }

        $minutesToAdd = 15 - ($time->minute % 15);

        return $time
            ->addMinutes($minutesToAdd)
            ->setSecond(0);
    }

    /**
     * @param  array<int, CarbonImmutable>  $times
     */
    private function maxTime(array $times): CarbonImmutable
    {
        return collect($times)
            ->sort()
            ->last();
    }

    /**
     * @param  array<int, CarbonImmutable>  $times
     */
    private function minTime(array $times): CarbonImmutable
    {
        return collect($times)
            ->sort()
            ->first();
    }
}
