<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PublicTherapistDetailResource;
use App\Http\Resources\PublicTherapistSearchResultResource;
use App\Models\Account;
use App\Models\IdentityVerification;
use App\Models\LocationSearchLog;
use App\Models\ProfilePhoto;
use App\Models\ServiceAddress;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use App\Services\Pricing\BookingQuoteCalculator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class TherapistDiscoveryController extends Controller
{
    public function index(Request $request, BookingQuoteCalculator $calculator): AnonymousResourceCollection
    {
        [$validated, $serviceAddress] = $this->validatedDiscoveryContext($request, requireServiceAddress: true);
        $results = $this->buildSearchResults(
            profiles: $this->discoverableProfilesQuery($request->user())->get(),
            serviceAddress: $serviceAddress,
            calculator: $calculator,
            requestedDurationMinutes: $validated['menu_duration_minutes'] ?? null,
            requestedStartAt: $validated['scheduled_start_at'] ?? null,
            isOnDemand: ($validated['start_type'] ?? 'now') !== 'scheduled',
            sort: $validated['sort'] ?? 'recommended',
        );

        LocationSearchLog::create([
            'account_id' => $request->user()->id,
            'searched_lat' => $serviceAddress->lat,
            'searched_lng' => $serviceAddress->lng,
            'searched_geohash' => null,
            'result_count' => $results->count(),
            'ip_hash' => $request->ip() ? hash('sha256', $request->ip()) : null,
            'created_at' => now(),
        ]);

        return PublicTherapistSearchResultResource::collection($results);
    }

    public function show(
        Request $request,
        TherapistProfile $therapistProfile,
        BookingQuoteCalculator $calculator,
    ): PublicTherapistDetailResource {
        [$validated, $serviceAddress] = $this->validatedDiscoveryContext($request, requireServiceAddress: false);

        $profile = $this->discoverableProfilesQuery($request->user())
            ->whereKey($therapistProfile->id)
            ->firstOrFail();

        return new PublicTherapistDetailResource(
            $this->buildDetailResult(
                profile: $profile,
                serviceAddress: $serviceAddress,
                calculator: $calculator,
                requestedDurationMinutes: $validated['menu_duration_minutes'] ?? null,
                requestedStartAt: $validated['scheduled_start_at'] ?? null,
                isOnDemand: ($validated['start_type'] ?? 'now') !== 'scheduled',
            )
        );
    }

    private function discoverableProfilesQuery(Account $viewer): Builder
    {
        return TherapistProfile::query()
            ->with([
                'location',
                'menus' => fn ($query) => $query
                    ->where('is_active', true)
                    ->orderBy('sort_order')
                    ->orderBy('id'),
                'photos' => fn ($query) => $query
                    ->where('status', ProfilePhoto::STATUS_APPROVED)
                    ->orderBy('sort_order')
                    ->orderBy('id'),
            ])
            ->where('account_id', '!=', $viewer->id)
            ->where('profile_status', TherapistProfile::STATUS_APPROVED)
            ->where('is_online', true)
            ->whereHas('menus', fn ($query) => $query->where('is_active', true))
            ->whereHas('location', fn ($query) => $query->where('is_searchable', true))
            ->whereHas('account', function (Builder $query) use ($viewer): void {
                $query
                    ->where('status', Account::STATUS_ACTIVE)
                    ->whereDoesntHave('blockedByAccounts', fn ($blockedBy) => $blockedBy
                        ->where('blocker_account_id', $viewer->id))
                    ->whereDoesntHave('blockedAccounts', fn ($blocked) => $blocked
                        ->where('blocked_account_id', $viewer->id));
            })
            ->whereHas('account.latestIdentityVerification', fn ($query) => $query
                ->where('status', IdentityVerification::STATUS_APPROVED));
    }

    private function buildSearchResults(
        Collection $profiles,
        ServiceAddress $serviceAddress,
        BookingQuoteCalculator $calculator,
        ?int $requestedDurationMinutes,
        ?string $requestedStartAt,
        bool $isOnDemand,
        string $sort,
    ): Collection {
        $results = $profiles
            ->map(function (TherapistProfile $profile) use (
                $serviceAddress,
                $calculator,
                $requestedDurationMinutes,
                $requestedStartAt,
                $isOnDemand,
            ): ?array {
                $estimate = $this->lowestEstimate(
                    profile: $profile,
                    serviceAddress: $serviceAddress,
                    calculator: $calculator,
                    requestedDurationMinutes: $requestedDurationMinutes,
                    requestedStartAt: $requestedStartAt,
                    isOnDemand: $isOnDemand,
                );

                if (! $estimate) {
                    return null;
                }

                return [
                    'public_id' => $profile->public_id,
                    'public_name' => $profile->public_name,
                    'bio_excerpt' => filled($profile->bio)
                        ? Str::limit($profile->bio, 80, '...')
                        : null,
                    'training_status' => $profile->training_status,
                    'rating_average' => (float) $profile->rating_average,
                    'review_count' => $profile->review_count,
                    'walking_time_range' => $estimate['walking_time_range'],
                    'estimated_total_amount' => $estimate['total_amount'],
                    'photos' => $this->publicPhotos($profile->photos->take(3)),
                    '_walking_time_minutes' => $estimate['walking_time_minutes'] ?? PHP_INT_MAX,
                ];
            })
            ->filter();

        $sorted = match ($sort) {
            'rating' => $results->sortBy([
                ['rating_average', 'desc'],
                ['review_count', 'desc'],
                ['_walking_time_minutes', 'asc'],
                ['public_id', 'asc'],
            ]),
            'soonest' => $results->sortBy([
                ['_walking_time_minutes', 'asc'],
                ['rating_average', 'desc'],
                ['review_count', 'desc'],
                ['public_id', 'asc'],
            ]),
            default => $results->sortBy([
                ['_walking_time_minutes', 'asc'],
                ['rating_average', 'desc'],
                ['review_count', 'desc'],
                ['estimated_total_amount', 'asc'],
                ['public_id', 'asc'],
            ]),
        };

        return $sorted->values()->map(function (array $result): array {
            unset($result['_walking_time_minutes']);

            return $result;
        });
    }

    private function buildDetailResult(
        TherapistProfile $profile,
        ?ServiceAddress $serviceAddress,
        BookingQuoteCalculator $calculator,
        ?int $requestedDurationMinutes,
        ?string $requestedStartAt,
        bool $isOnDemand,
    ): array {
        $menuEstimates = $profile->menus
            ->map(function (TherapistMenu $menu) use (
                $profile,
                $serviceAddress,
                $calculator,
                $requestedDurationMinutes,
                $requestedStartAt,
                $isOnDemand,
            ): array {
                $estimate = $serviceAddress
                    ? $calculator->calculate(
                        therapistProfile: $profile,
                        menu: $menu,
                        serviceAddress: $serviceAddress,
                        durationMinutes: $requestedDurationMinutes ?? $menu->duration_minutes,
                        isOnDemand: $isOnDemand,
                        requestedStartAt: $requestedStartAt,
                    )
                    : null;

                return [
                    'public_id' => $menu->public_id,
                    'name' => $menu->name,
                    'description' => $menu->description,
                    'duration_minutes' => $menu->duration_minutes,
                    'base_price_amount' => $menu->base_price_amount,
                    'estimated_total_amount' => $estimate['total_amount'] ?? null,
                ];
            })
            ->values();

        $walkingEstimate = $serviceAddress
            ? $this->lowestEstimate(
                profile: $profile,
                serviceAddress: $serviceAddress,
                calculator: $calculator,
                requestedDurationMinutes: $requestedDurationMinutes,
                requestedStartAt: $requestedStartAt,
                isOnDemand: $isOnDemand,
            )
            : null;

        return [
            'public_id' => $profile->public_id,
            'public_name' => $profile->public_name,
            'bio' => $profile->bio,
            'training_status' => $profile->training_status,
            'rating_average' => (float) $profile->rating_average,
            'review_count' => $profile->review_count,
            'is_online' => $profile->is_online,
            'walking_time_range' => $walkingEstimate['walking_time_range'] ?? null,
            'lowest_estimated_total_amount' => $walkingEstimate['total_amount'] ?? null,
            'menus' => $menuEstimates->all(),
            'photos' => $this->publicPhotos($profile->photos),
        ];
    }

    private function lowestEstimate(
        TherapistProfile $profile,
        ServiceAddress $serviceAddress,
        BookingQuoteCalculator $calculator,
        ?int $requestedDurationMinutes,
        ?string $requestedStartAt,
        bool $isOnDemand,
    ): ?array {
        return $profile->menus
            ->map(function (TherapistMenu $menu) use (
                $profile,
                $serviceAddress,
                $calculator,
                $requestedDurationMinutes,
                $requestedStartAt,
                $isOnDemand,
            ): array {
                return $calculator->calculate(
                    therapistProfile: $profile,
                    menu: $menu,
                    serviceAddress: $serviceAddress,
                    durationMinutes: $requestedDurationMinutes ?? $menu->duration_minutes,
                    isOnDemand: $isOnDemand,
                    requestedStartAt: $requestedStartAt,
                );
            })
            ->sortBy('total_amount')
            ->first();
    }

    private function publicPhotos(Collection $photos): array
    {
        return $photos
            ->map(fn (ProfilePhoto $photo): array => [
                'sort_order' => $photo->sort_order,
                'url' => rescue(
                    fn () => Storage::disk('local')->temporaryUrl(
                        Crypt::decryptString($photo->storage_key_encrypted),
                        now()->addMinutes(30),
                    ),
                    null,
                    report: false,
                ),
            ])
            ->values()
            ->all();
    }

    private function validatedDiscoveryContext(Request $request, bool $requireServiceAddress): array
    {
        $validated = $request->validate([
            'service_address_id' => array_values(array_filter([
                $requireServiceAddress ? 'required' : 'nullable',
                'string',
                'max:36',
            ])),
            'menu_duration_minutes' => ['nullable', 'integer', 'min:30', 'max:240'],
            'start_type' => ['nullable', Rule::in(['now', 'scheduled'])],
            'scheduled_start_at' => ['nullable', 'date', 'after_or_equal:now'],
            'sort' => ['nullable', Rule::in(['recommended', 'soonest', 'rating'])],
        ]);

        $validated['start_type'] = $validated['start_type'] ?? 'now';

        if ($validated['start_type'] === 'scheduled' && blank($validated['scheduled_start_at'] ?? null)) {
            throw ValidationException::withMessages([
                'scheduled_start_at' => 'Scheduled start time is required when start_type is scheduled.',
            ]);
        }

        if ($validated['start_type'] !== 'scheduled') {
            $validated['scheduled_start_at'] = null;
        }

        $serviceAddress = null;

        if (filled($validated['service_address_id'] ?? null)) {
            $serviceAddress = ServiceAddress::query()
                ->where('public_id', $validated['service_address_id'])
                ->where('account_id', $request->user()->id)
                ->firstOrFail();
        }

        return [$validated, $serviceAddress];
    }
}
