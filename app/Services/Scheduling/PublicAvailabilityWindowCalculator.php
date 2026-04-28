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
        ?int $requestedDurationMinutes = null,
        ?int $excludeBookingId = null,
    ): array {
        return $this->calculateWithAvailableDates(
            profile: $profile,
            menu: $menu,
            serviceAddress: $serviceAddress,
            date: $date,
            availableDatesStartDate: $date,
            requestedDurationMinutes: $requestedDurationMinutes,
            availableDatesDays: 1,
            excludeBookingId: $excludeBookingId,
        );
    }

    public function calculateWithAvailableDates(
        TherapistProfile $profile,
        TherapistMenu $menu,
        ServiceAddress $serviceAddress,
        CarbonImmutable $date,
        CarbonImmutable $availableDatesStartDate,
        ?int $requestedDurationMinutes = null,
        int $availableDatesDays = 14,
        ?int $excludeBookingId = null,
    ): array {
        $availableDatesDays = max(1, $availableDatesDays);
        $durationMinutes = max($requestedDurationMinutes ?? $menu->minimum_duration_minutes, $menu->minimum_duration_minutes);
        $calendarStart = $availableDatesStartDate->startOfDay();
        $calendarEnd = $availableDatesStartDate->addDays($availableDatesDays - 1)->endOfDay();
        $contextStart = $this->minTime([$date->startOfDay(), $calendarStart]);
        $contextEnd = $this->maxTime([$date->endOfDay(), $calendarEnd]);
        $context = $this->buildScheduleContext(
            profile: $profile,
            rangeStart: $contextStart,
            rangeEnd: $contextEnd,
            excludeBookingId: $excludeBookingId,
        );
        $selectedSnapshot = $this->calculateSnapshotForDate(
            profile: $profile,
            date: $date,
            menu: $menu,
            durationMinutes: $durationMinutes,
            serviceAddress: $serviceAddress,
            context: $context,
        );
        $availableDates = collect();
        $calendarDates = collect();

        for ($cursor = $calendarStart; $cursor <= $calendarEnd; $cursor = $cursor->addDay()) {
            $snapshot = $cursor->isSameDay($date)
                ? $selectedSnapshot
                : $this->calculateSnapshotForDate(
                    profile: $profile,
                    date: $cursor,
                    menu: $menu,
                    durationMinutes: $durationMinutes,
                    serviceAddress: $serviceAddress,
                    context: $context,
                );

            $windows = collect($snapshot['windows']);
            $bookableWindows = $windows->where('is_bookable', true)->values();
            $isBookable = $bookableWindows->isNotEmpty();
            $unavailableReason = $isBookable
                ? null
                : $windows->pluck('unavailable_reason')->filter()->first();

            $calendarDates->push([
                'date' => $snapshot['date'],
                'earliest_start_at' => $windows->min('start_at'),
                'latest_end_at' => $windows->max('end_at'),
                'walking_time_range' => $snapshot['walking_time_range'],
                'estimated_total_amount_range' => $snapshot['estimated_total_amount_range'],
                'window_count' => $windows->count(),
                'bookable_window_count' => $bookableWindows->count(),
                'is_bookable' => $isBookable,
                'unavailable_reason' => $unavailableReason,
                'windows' => $windows->values()->all(),
            ]);

            if ($windows->isEmpty()) {
                continue;
            }

            $availableDates->push([
                'date' => $snapshot['date'],
                'earliest_start_at' => $windows->min('start_at'),
                'latest_end_at' => $windows->max('end_at'),
                'window_count' => $windows->count(),
                'bookable_window_count' => $bookableWindows->count(),
                'is_bookable' => $isBookable,
                'unavailable_reason' => $unavailableReason,
            ]);
        }

        return [
            ...$selectedSnapshot,
            'available_dates' => $availableDates->values()->all(),
            'calendar_dates' => $calendarDates->values()->all(),
        ];
    }

    /**
     * @return array{
     *     bookingSetting: TherapistBookingSetting,
     *     leadTimeMinutes: int,
     *     roundedNow: CarbonImmutable,
     *     leadStart: CarbonImmutable,
     *     onDemandBlockedUntil: CarbonImmutable|null,
     *     slots: Collection<int, TherapistAvailabilitySlot>,
     *     blockingBookings: Collection<int, Booking>
     * }
     */
    private function buildScheduleContext(
        TherapistProfile $profile,
        CarbonImmutable $rangeStart,
        CarbonImmutable $rangeEnd,
        ?int $excludeBookingId = null,
    ): array {
        /** @var TherapistBookingSetting $bookingSetting */
        $bookingSetting = $profile->relationLoaded('bookingSetting')
            ? $profile->bookingSetting
            : $profile->bookingSetting()->firstOrFail();

        $leadTimeMinutes = $bookingSetting->booking_request_lead_time_minutes;
        $now = CarbonImmutable::now();

        return [
            'bookingSetting' => $bookingSetting,
            'leadTimeMinutes' => $leadTimeMinutes,
            'roundedNow' => $this->roundUpToQuarter($now),
            'leadStart' => $this->roundUpToQuarter($now->addMinutes($leadTimeMinutes)),
            'onDemandBlockedUntil' => $this->hasActiveOnDemandBooking($profile)
                ? $this->roundUpToQuarter($now->addHours(6))
                : null,
            'slots' => $profile->availabilitySlots()
                ->where('status', TherapistAvailabilitySlot::STATUS_PUBLISHED)
                ->where('start_at', '<=', $rangeEnd)
                ->where('end_at', '>=', $rangeStart)
                ->orderBy('start_at')
                ->get(),
            'blockingBookings' => Booking::query()
                ->where('therapist_profile_id', $profile->id)
                ->where('is_on_demand', false)
                ->whereIn('status', self::BLOCKING_SCHEDULED_BOOKING_STATUSES)
                ->when($excludeBookingId !== null, fn ($query) => $query->whereKeyNot($excludeBookingId))
                ->where(function ($query) use ($rangeStart, $rangeEnd): void {
                    $query
                        ->where(function ($query) use ($rangeEnd): void {
                            $query
                                ->whereNotNull('requested_start_at')
                                ->where('requested_start_at', '<', $rangeEnd);
                        })
                        ->orWhere(function ($query) use ($rangeStart): void {
                            $query
                                ->whereNotNull('scheduled_end_at')
                                ->where('scheduled_end_at', '>', $rangeStart);
                        });
                })
                ->get(),
        ];
    }

    /**
     * @param  array{
     *     bookingSetting: TherapistBookingSetting,
     *     leadTimeMinutes: int,
     *     roundedNow: CarbonImmutable,
     *     leadStart: CarbonImmutable,
     *     onDemandBlockedUntil: CarbonImmutable|null,
     *     slots: Collection<int, TherapistAvailabilitySlot>,
     *     blockingBookings: Collection<int, Booking>
     * }  $context
     * @return array{
     *     date: string,
     *     walking_time_range: string|null,
     *     estimated_total_amount_range: array{min:int,max:int}|null,
     *     windows: array<int, array{
     *         availability_slot_id: string,
     *         slot_start_at: CarbonImmutable,
     *         slot_end_at: CarbonImmutable,
     *         start_at: CarbonImmutable,
     *         end_at: CarbonImmutable,
     *         booking_deadline_at: CarbonImmutable,
     *         dispatch_area_label: string|null,
     *         walking_time_range: string|null,
     *         is_bookable: bool,
     *         unavailable_reason: string|null
     *     }>
     * }
     */
    private function calculateSnapshotForDate(
        TherapistProfile $profile,
        CarbonImmutable $date,
        TherapistMenu $menu,
        int $durationMinutes,
        ServiceAddress $serviceAddress,
        array $context,
    ): array {
        $startOfDay = $date->startOfDay();
        $endOfDay = $date->endOfDay();
        $leadTimeMinutes = $context['leadTimeMinutes'];

        $windows = collect();
        $minAmount = null;
        $maxAmount = null;
        $bestWalkingMinutes = null;

        foreach ($context['slots'] as $slot) {
            $dispatchBase = $this->dispatchBaseForSlot($slot, $context['bookingSetting']);

            if (! $dispatchBase) {
                continue;
            }

            $intervalStart = $this->maxTime([
                CarbonImmutable::instance($slot->start_at),
                $startOfDay,
                $context['roundedNow'],
                $context['leadStart'],
            ]);
            $intervalEnd = $this->minTime([
                CarbonImmutable::instance($slot->end_at),
                $endOfDay,
            ]);

            if ($context['onDemandBlockedUntil'] !== null) {
                $intervalStart = $this->maxTime([$intervalStart, $context['onDemandBlockedUntil']]);
            }

            if ($intervalStart->greaterThanOrEqualTo($intervalEnd)) {
                continue;
            }

            $walking = $this->calculator->walkingEstimateFromCoordinates(
                $dispatchBase['lat'],
                $dispatchBase['lng'],
                (float) $serviceAddress->lat,
                (float) $serviceAddress->lng,
                $context['bookingSetting']->travel_mode ?: TherapistBookingSetting::TRAVEL_MODE_WALKING,
                $context['bookingSetting']->max_travel_minutes ?: 120,
            );
            $isBookableForAddress = $walking['walking_time_range'] !== 'outside_area';

            $freeIntervals = $this->subtractBlockingIntervals(
                startAt: $intervalStart,
                endAt: $intervalEnd,
                blockingIntervals: $this->blockingIntervalsForSlot($context['blockingBookings'], $slot),
            );

            foreach ($freeIntervals as $freeInterval) {
                [$freeStart, $freeEnd] = $freeInterval;

                if ($freeStart->diffInMinutes($freeEnd) < $durationMinutes) {
                    continue;
                }

                if ($isBookableForAddress) {
                    $windowRange = $this->windowAmountRange(
                        profile: $profile,
                        menu: $menu,
                        serviceAddress: $serviceAddress,
                        durationMinutes: $durationMinutes,
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
                }

                $windows->push([
                    'availability_slot_id' => $slot->public_id,
                    'slot_start_at' => CarbonImmutable::instance($slot->start_at),
                    'slot_end_at' => CarbonImmutable::instance($slot->end_at),
                    'start_at' => $freeStart,
                    'end_at' => $freeEnd,
                    'booking_deadline_at' => $freeStart->subMinutes($leadTimeMinutes),
                    'dispatch_area_label' => $slot->dispatch_area_label,
                    'walking_time_range' => $walking['walking_time_range'],
                    'is_bookable' => $isBookableForAddress,
                    'unavailable_reason' => $isBookableForAddress ? null : 'outside_service_area',
                ]);
            }
        }

        return [
            'date' => $date->toDateString(),
            'walking_time_range' => $bestWalkingMinutes !== null
                ? $this->walkingTimeRangeFromMinutes(
                    $bestWalkingMinutes,
                    $context['bookingSetting']->max_travel_minutes ?: 120,
                )
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
        int $durationMinutes,
        CarbonImmutable $freeStart,
        CarbonImmutable $freeEnd,
        float $originLat,
        float $originLng,
    ): ?array {
        $latestStartAt = $freeEnd->subMinutes($durationMinutes);

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
                durationMinutes: $durationMinutes,
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

    private function walkingTimeRangeFromMinutes(int $minutes, int $maxTravelMinutes): string
    {
        return $this->calculator->travelTimeRangeFromMinutes($minutes, $maxTravelMinutes);
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
