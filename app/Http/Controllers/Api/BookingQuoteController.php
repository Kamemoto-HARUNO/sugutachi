<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BookingQuoteResource;
use App\Models\BookingQuote;
use App\Models\ServiceAddress;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use App\Services\Pricing\BookingQuoteCalculator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class BookingQuoteController extends Controller
{
    public function store(Request $request, BookingQuoteCalculator $calculator): JsonResponse
    {
        $validated = $request->validate([
            'therapist_profile_id' => ['required', 'string', 'max:36'],
            'therapist_menu_id' => ['required', 'string', 'max:36'],
            'service_address_id' => ['required', 'string', 'max:36'],
            'duration_minutes' => ['required', 'integer', 'min:30', 'max:240'],
            'is_on_demand' => ['sometimes', 'boolean'],
            'requested_start_at' => ['nullable', 'date', 'after_or_equal:now'],
        ]);

        $therapistProfile = TherapistProfile::query()
            ->with('location')
            ->where('public_id', $validated['therapist_profile_id'])
            ->firstOrFail();

        $menu = TherapistMenu::query()
            ->where('public_id', $validated['therapist_menu_id'])
            ->where('therapist_profile_id', $therapistProfile->id)
            ->where('is_active', true)
            ->firstOrFail();

        $serviceAddress = ServiceAddress::query()
            ->where('public_id', $validated['service_address_id'])
            ->where('account_id', $request->user()->id)
            ->firstOrFail();

        $amounts = $calculator->calculate(
            therapistProfile: $therapistProfile,
            menu: $menu,
            serviceAddress: $serviceAddress,
            durationMinutes: $validated['duration_minutes'],
            isOnDemand: $validated['is_on_demand'] ?? true,
            requestedStartAt: $validated['requested_start_at'] ?? null,
        );

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
}
