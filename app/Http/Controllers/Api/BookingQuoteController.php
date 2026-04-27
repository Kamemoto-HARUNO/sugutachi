<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BookingQuoteResource;
use App\Models\BookingQuote;
use App\Models\ServiceAddress;
use App\Models\TherapistAvailabilitySlot;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use App\Services\Bookings\ScheduledBookingPolicy;
use App\Services\Pricing\BookingQuoteCalculator;
use App\Services\Scheduling\PublicAvailabilityWindowCalculator;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class BookingQuoteController extends Controller
{
    public function store(
        Request $request,
        BookingQuoteCalculator $calculator,
        PublicAvailabilityWindowCalculator $availabilityCalculator,
        ScheduledBookingPolicy $scheduledBookingPolicy,
    ): JsonResponse {
        $validated = $request->validate([
            'therapist_profile_id' => ['required', 'string', 'max:36'],
            'therapist_menu_id' => ['required', 'string', 'max:36'],
            'service_address_id' => ['required', 'string', 'max:36'],
            'duration_minutes' => ['required', 'integer', 'min:30', 'max:240'],
            'is_on_demand' => ['sometimes', 'boolean'],
            'availability_slot_id' => ['nullable', 'string', 'max:36'],
            'requested_start_at' => ['nullable', 'date', 'after_or_equal:now'],
        ]);

        $isOnDemand = $validated['is_on_demand'] ?? true;
        $requestedStartAt = filled($validated['requested_start_at'] ?? null)
            ? CarbonImmutable::parse($validated['requested_start_at'])
            : null;

        if (! $isOnDemand) {
            if (! $requestedStartAt) {
                throw ValidationException::withMessages([
                    'requested_start_at' => ['The requested start time is required for scheduled bookings.'],
                ]);
            }

            if (! filled($validated['availability_slot_id'] ?? null)) {
                throw ValidationException::withMessages([
                    'availability_slot_id' => ['The availability slot is required for scheduled bookings.'],
                ]);
            }

            $scheduledBookingPolicy->assertQuarterHourAligned($requestedStartAt);
            $scheduledBookingPolicy->assertQuarterHourDuration($validated['duration_minutes']);
        }

        $therapistProfile = TherapistProfile::query()
            ->with(['location', 'bookingSetting'])
            ->when(
                $isOnDemand,
                fn ($query) => $query->discoverableTo($request->user()),
                fn ($query) => $query->scheduledDiscoverableTo($request->user()),
            )
            ->where('public_id', $validated['therapist_profile_id'])
            ->firstOrFail();

        $menu = TherapistMenu::query()
            ->where('public_id', $validated['therapist_menu_id'])
            ->where('therapist_profile_id', $therapistProfile->id)
            ->where('is_active', true)
            ->firstOrFail();

        if (! $menu->supportsDuration($validated['duration_minutes'])) {
            throw ValidationException::withMessages([
                'duration_minutes' => ['The requested duration is shorter than the minimum duration for this menu.'],
            ]);
        }

        $serviceAddress = ServiceAddress::query()
            ->where('public_id', $validated['service_address_id'])
            ->where('account_id', $request->user()->id)
            ->firstOrFail();

        $slot = null;
        $originLat = null;
        $originLng = null;

        if (! $isOnDemand) {
            $slot = TherapistAvailabilitySlot::query()
                ->where('public_id', $validated['availability_slot_id'])
                ->where('therapist_profile_id', $therapistProfile->id)
                ->where('status', TherapistAvailabilitySlot::STATUS_PUBLISHED)
                ->firstOrFail();

            $availability = $availabilityCalculator->calculate(
                profile: $therapistProfile,
                menu: $menu,
                serviceAddress: $serviceAddress,
                date: $requestedStartAt->startOfDay(),
                requestedDurationMinutes: $validated['duration_minutes'],
            );

            $matchingWindow = collect($availability['windows'])
                ->first(fn (array $window): bool => $window['availability_slot_id'] === $slot->public_id
                    && ($window['is_bookable'] ?? true)
                    && CarbonImmutable::instance($window['start_at'])->lte($requestedStartAt)
                    && CarbonImmutable::instance($window['end_at'])->gte($requestedStartAt->addMinutes($validated['duration_minutes'])));

            abort_if(
                ! $matchingWindow,
                409,
                'The requested time is no longer available for that slot.'
            );

            [$originLat, $originLng] = $this->dispatchCoordinates($therapistProfile, $slot);
        }

        $amounts = $calculator->calculate(
            therapistProfile: $therapistProfile,
            menu: $menu,
            serviceAddress: $serviceAddress,
            durationMinutes: $validated['duration_minutes'],
            isOnDemand: $isOnDemand,
            requestedStartAt: $requestedStartAt?->toIso8601String(),
            originLat: $originLat,
            originLng: $originLng,
        );

        $amounts['input_snapshot_json']['availability_slot_id'] = $slot?->public_id;
        $amounts['input_snapshot_json']['dispatch_area_label'] = $slot?->dispatch_area_label;

        $quote = BookingQuote::create([
            'public_id' => 'quote_'.Str::ulid(),
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $menu->id,
            'duration_minutes' => $amounts['duration_minutes'],
            'base_amount' => $amounts['base_amount'],
            'travel_fee_amount' => $amounts['travel_fee_amount'],
            'night_fee_amount' => $amounts['night_fee_amount'],
            'demand_fee_amount' => $amounts['demand_fee_amount'],
            'profile_adjustment_amount' => $amounts['profile_adjustment_amount'],
            'matching_fee_amount' => $amounts['matching_fee_amount'],
            'platform_fee_amount' => $amounts['platform_fee_amount'],
            'total_amount' => $amounts['total_amount'],
            'therapist_gross_amount' => $amounts['therapist_gross_amount'],
            'therapist_net_amount' => $amounts['therapist_net_amount'],
            'calculation_version' => 'mvp-v1',
            'input_snapshot_json' => $amounts['input_snapshot_json'],
            'applied_rules_json' => $amounts['applied_rules_json'],
            'expires_at' => now()->addMinutes(10),
        ]);

        return (new BookingQuoteResource($quote))
            ->response()
            ->setStatusCode(201);
    }

    /**
     * @return array{0: float, 1: float}
     */
    private function dispatchCoordinates(
        TherapistProfile $therapistProfile,
        TherapistAvailabilitySlot $slot,
    ): array {
        if ($slot->dispatch_base_type === TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_CUSTOM) {
            return [
                (float) $slot->custom_dispatch_base_lat,
                (float) $slot->custom_dispatch_base_lng,
            ];
        }

        return [
            (float) $therapistProfile->bookingSetting->scheduled_base_lat,
            (float) $therapistProfile->bookingSetting->scheduled_base_lng,
        ];
    }
}
