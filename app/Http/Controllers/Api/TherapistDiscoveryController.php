<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PublicTherapistAvailabilityResource;
use App\Http\Resources\PublicTherapistDetailResource;
use App\Http\Resources\PublicTherapistSearchResultResource;
use App\Models\Account;
use App\Models\Booking;
use App\Models\LocationSearchLog;
use App\Models\ProfilePhoto;
use App\Models\ServiceAddress;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use App\Services\Pricing\BookingQuoteCalculator;
use App\Services\Scheduling\PublicAvailabilityWindowCalculator;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class TherapistDiscoveryController extends Controller
{
    public function publicIndex(Request $request): AnonymousResourceCollection
    {
        $validated = $request->validate([
            'limit' => ['nullable', 'integer', 'min:1', 'max:12'],
        ]);

        $viewer = $this->authenticatedViewer($request);
        $limit = $validated['limit'] ?? 4;

        $profiles = TherapistProfile::query()
            ->visibleTo($viewer)
            ->with([
                'account.latestIdentityVerification',
                'photos' => fn ($query) => $query
                    ->where('status', ProfilePhoto::STATUS_APPROVED)
                    ->orderBy('sort_order')
                    ->orderBy('id'),
            ])
            ->orderByDesc('is_online')
            ->orderByDesc('rating_average')
            ->orderByDesc('review_count')
            ->orderBy('id')
            ->limit($limit)
            ->get();

        $results = $profiles->map(function (TherapistProfile $profile): array {
            $identityVerification = $profile->account?->latestIdentityVerification;

            return [
                'public_id' => $profile->public_id,
                'public_name' => $profile->public_name,
                'bio_excerpt' => filled($profile->bio)
                    ? Str::limit($profile->bio, 80, '...')
                    : null,
                'age' => $identityVerification?->resolvedAge(),
                'height_cm' => $profile->height_cm === null ? null : (int) $profile->height_cm,
                'weight_kg' => $profile->weight_kg === null ? null : (int) $profile->weight_kg,
                'p_size_cm' => $profile->p_size_cm === null ? null : (int) $profile->p_size_cm,
                'training_status' => $profile->training_status,
                'rating_average' => (float) $profile->rating_average,
                'review_count' => $profile->review_count,
                'therapist_cancellation_count' => (int) $profile->therapist_cancellation_count,
                'walking_time_range' => null,
                'estimated_total_amount' => null,
                'photos' => $this->publicPhotos($profile->photos->take(1)),
            ];
        });

        return PublicTherapistSearchResultResource::collection($results);
    }

    public function availability(
        Request $request,
        TherapistProfile $therapistProfile,
        PublicAvailabilityWindowCalculator $calculator,
    ): PublicTherapistAvailabilityResource {
        $validated = $request->validate([
            'service_address_id' => ['required', 'string', 'max:36'],
            'therapist_menu_id' => ['required', 'string', 'max:36'],
            'date' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'available_dates_from' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:today'],
            'calendar_days' => ['nullable', 'integer', 'min:1', 'max:14'],
            'menu_duration_minutes' => ['nullable', 'integer', 'min:30', 'max:240'],
            'duration_minutes' => ['nullable', 'integer', 'min:30', 'max:240'],
        ]);

        $profile = TherapistProfile::query()
            ->scheduledDiscoverableTo($request->user())
            ->with('bookingSetting')
            ->whereKey($therapistProfile->id)
            ->firstOrFail();

        $menu = TherapistMenu::query()
            ->where('public_id', $validated['therapist_menu_id'])
            ->where('therapist_profile_id', $profile->id)
            ->where('is_active', true)
            ->firstOrFail();

        $serviceAddress = ServiceAddress::query()
            ->where('public_id', $validated['service_address_id'])
            ->where('account_id', $request->user()->id)
            ->firstOrFail();

        $selectedDate = CarbonImmutable::createFromFormat('Y-m-d', $validated['date']);
        $availableDatesStartDate = CarbonImmutable::createFromFormat(
            'Y-m-d',
            $validated['available_dates_from'] ?? $validated['date'],
        );
        $requestedDurationMinutes = (int) ($validated['menu_duration_minutes']
            ?? $validated['duration_minutes']
            ?? $menu->minimum_duration_minutes);

        return new PublicTherapistAvailabilityResource(
            [
                ...$calculator->calculateWithAvailableDates(
                    profile: $profile,
                    menu: $menu,
                    serviceAddress: $serviceAddress,
                    date: $selectedDate,
                    availableDatesStartDate: $availableDatesStartDate,
                    requestedDurationMinutes: $requestedDurationMinutes,
                    availableDatesDays: (int) ($validated['calendar_days'] ?? 14),
                ),
                'pending_scheduled_request' => $this->pendingScheduledRequestSummary($request->user(), $profile),
            ]
        );
    }

    public function index(Request $request, BookingQuoteCalculator $calculator): AnonymousResourceCollection
    {
        [$validated, $serviceAddress] = $this->validatedDiscoveryContext($request, requireServiceAddress: true);
        $viewer = $request->user();
        $profiles = ($validated['start_type'] ?? 'now') === 'scheduled'
            ? TherapistProfile::query()
                ->scheduledDiscoverableTo($viewer)
                ->with([
                    'account.latestIdentityVerification',
                    'location',
                    'menus' => fn ($query) => $query
                        ->where('is_active', true)
                        ->orderBy('sort_order')
                        ->orderBy('id'),
                    'pricingRules',
                    'photos' => fn ($query) => $query
                        ->where('status', ProfilePhoto::STATUS_APPROVED)
                        ->orderBy('sort_order')
                        ->orderBy('id'),
                ])
                ->get()
            : $this->discoverableProfilesQuery($viewer)->get();

        $results = $this->buildSearchResults(
            profiles: $profiles,
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
        $viewer = $this->authenticatedViewer($request);
        [$validated, $serviceAddress] = $this->validatedDiscoveryContext($request, requireServiceAddress: false, viewer: $viewer);

        $profile = $this->detailProfileForViewer($therapistProfile, $viewer);

        return new PublicTherapistDetailResource(
            $this->buildDetailResult(
                profile: $profile,
                viewer: $viewer,
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
            ->discoverableTo($viewer)
            ->with([
                'account.latestIdentityVerification',
                'location',
                'menus' => fn ($query) => $query
                    ->where('is_active', true)
                    ->orderBy('sort_order')
                    ->orderBy('id'),
                'pricingRules',
                'photos' => fn ($query) => $query
                    ->where('status', ProfilePhoto::STATUS_APPROVED)
                    ->orderBy('sort_order')
                    ->orderBy('id'),
            ]);
    }

    private function detailProfilesQuery(?Account $viewer): Builder
    {
        return TherapistProfile::query()
            ->visibleTo($viewer)
            ->with([
                'account.latestIdentityVerification',
                'location',
                'menus' => fn ($query) => $query
                    ->where('is_active', true)
                    ->orderBy('sort_order')
                    ->orderBy('id'),
                'pricingRules',
                'photos' => fn ($query) => $query
                    ->where('status', ProfilePhoto::STATUS_APPROVED)
                    ->orderBy('sort_order')
                    ->orderBy('id'),
            ]);
    }

    private function ownDetailProfileQuery(TherapistProfile $therapistProfile): Builder
    {
        return TherapistProfile::query()
            ->whereKey($therapistProfile->id)
            ->with([
                'account.latestIdentityVerification',
                'location',
                'menus' => fn ($query) => $query
                    ->where('is_active', true)
                    ->orderBy('sort_order')
                    ->orderBy('id'),
                'pricingRules',
                'photos' => fn ($query) => $query
                    ->where('status', ProfilePhoto::STATUS_APPROVED)
                    ->orderBy('sort_order')
                    ->orderBy('id'),
            ]);
    }

    private function detailProfileForViewer(TherapistProfile $therapistProfile, ?Account $viewer): TherapistProfile
    {
        if ($viewer && $therapistProfile->account_id === $viewer->id) {
            return $this->ownDetailProfileQuery($therapistProfile)->firstOrFail();
        }

        return $this->detailProfilesQuery($viewer)
            ->whereKey($therapistProfile->id)
            ->firstOrFail();
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

                $identityVerification = $profile->account?->latestIdentityVerification;

                return [
                    'public_id' => $profile->public_id,
                    'public_name' => $profile->public_name,
                    'bio_excerpt' => filled($profile->bio)
                        ? Str::limit($profile->bio, 80, '...')
                        : null,
                    'age' => $identityVerification?->resolvedAge(),
                    'height_cm' => $profile->height_cm === null ? null : (int) $profile->height_cm,
                    'weight_kg' => $profile->weight_kg === null ? null : (int) $profile->weight_kg,
                    'p_size_cm' => $profile->p_size_cm === null ? null : (int) $profile->p_size_cm,
                    'training_status' => $profile->training_status,
                    'rating_average' => (float) $profile->rating_average,
                    'review_count' => $profile->review_count,
                    'therapist_cancellation_count' => (int) $profile->therapist_cancellation_count,
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
        ?Account $viewer,
        ?ServiceAddress $serviceAddress,
        BookingQuoteCalculator $calculator,
        ?int $requestedDurationMinutes,
        ?string $requestedStartAt,
        bool $isOnDemand,
    ): array {
        $identityVerification = $profile->account?->latestIdentityVerification;
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
                    ? $this->estimateForMenuDuration(
                        therapistProfile: $profile,
                        menu: $menu,
                        serviceAddress: $serviceAddress,
                        calculator: $calculator,
                        requestedDurationMinutes: $requestedDurationMinutes,
                        requestedStartAt: $requestedStartAt,
                        isOnDemand: $isOnDemand,
                    )
                    : null;

                return [
                    'public_id' => $menu->public_id,
                    'name' => $menu->name,
                    'description' => $menu->description,
                    'duration_minutes' => $menu->duration_minutes,
                    'minimum_duration_minutes' => $menu->minimum_duration_minutes,
                    'duration_step_minutes' => $menu->duration_step_minutes,
                    'base_price_amount' => $menu->base_price_amount,
                    'hourly_rate_amount' => $menu->hourly_rate_amount,
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
            'is_self_view' => $viewer?->id === $profile->account_id,
            'age' => $identityVerification?->resolvedAge(),
            'height_cm' => $profile->height_cm === null ? null : (int) $profile->height_cm,
            'weight_kg' => $profile->weight_kg === null ? null : (int) $profile->weight_kg,
            'p_size_cm' => $profile->p_size_cm === null ? null : (int) $profile->p_size_cm,
            'training_status' => $profile->training_status,
            'rating_average' => (float) $profile->rating_average,
            'review_count' => $profile->review_count,
            'therapist_cancellation_count' => (int) $profile->therapist_cancellation_count,
            'is_online' => $profile->is_online,
            'walking_time_range' => $walkingEstimate['walking_time_range'] ?? null,
            'lowest_estimated_total_amount' => $walkingEstimate['total_amount'] ?? null,
            'pending_scheduled_request' => $this->pendingScheduledRequestSummary($viewer, $profile),
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
            ): ?array {
                return $this->estimateForMenuDuration(
                    therapistProfile: $profile,
                    menu: $menu,
                    serviceAddress: $serviceAddress,
                    calculator: $calculator,
                    requestedDurationMinutes: $requestedDurationMinutes,
                    requestedStartAt: $requestedStartAt,
                    isOnDemand: $isOnDemand,
                );
            })
            ->filter()
            ->sortBy('total_amount')
            ->first();
    }

    private function estimateForMenuDuration(
        TherapistProfile $therapistProfile,
        TherapistMenu $menu,
        ServiceAddress $serviceAddress,
        BookingQuoteCalculator $calculator,
        ?int $requestedDurationMinutes,
        ?string $requestedStartAt,
        bool $isOnDemand,
    ): ?array {
        $durationMinutes = $requestedDurationMinutes ?? $menu->minimum_duration_minutes;

        if (! $menu->supportsDuration($durationMinutes)) {
            return null;
        }

        return $calculator->calculate(
            therapistProfile: $therapistProfile,
            menu: $menu,
            serviceAddress: $serviceAddress,
            durationMinutes: $durationMinutes,
            isOnDemand: $isOnDemand,
            requestedStartAt: $requestedStartAt,
        );
    }

    private function publicPhotos(Collection $photos): array
    {
        return $photos
            ->map(fn (ProfilePhoto $photo): array => [
                'sort_order' => $photo->sort_order,
                'url' => "/api/profile-photos/{$photo->id}/file",
            ])
            ->values()
            ->all();
    }

    private function validatedDiscoveryContext(Request $request, bool $requireServiceAddress, ?Account $viewer = null): array
    {
        $viewer ??= $this->authenticatedViewer($request);
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
                'scheduled_start_at' => '日時指定で探す場合は開始日時の指定が必要です。',
            ]);
        }

        if ($validated['start_type'] !== 'scheduled') {
            $validated['scheduled_start_at'] = null;
        }

        $serviceAddress = null;

        if (filled($validated['service_address_id'] ?? null)) {
            if (! $viewer) {
                throw ValidationException::withMessages([
                    'service_address_id' => '保存した待ち合わせ場所を使うにはログインが必要です。',
                ]);
            }

            $serviceAddress = ServiceAddress::query()
                ->where('public_id', $validated['service_address_id'])
                ->where('account_id', $viewer->id)
                ->firstOrFail();
        }

        return [$validated, $serviceAddress];
    }

    private function authenticatedViewer(Request $request): ?Account
    {
        return $request->user() ?? Auth::guard('sanctum')->user();
    }

    private function pendingScheduledRequestSummary(?Account $viewer, TherapistProfile $profile): ?array
    {
        if (! $viewer) {
            return null;
        }

        $booking = Booking::query()
            ->where('user_account_id', $viewer->id)
            ->where('therapist_profile_id', $profile->id)
            ->where('is_on_demand', false)
            ->whereIn('status', [
                Booking::STATUS_PAYMENT_AUTHORIZING,
                Booking::STATUS_REQUESTED,
            ])
            ->latest('id')
            ->first();

        if (! $booking) {
            return null;
        }

        return [
            'public_id' => $booking->public_id,
            'status' => $booking->status,
            'requested_start_at' => $booking->requested_start_at?->toIso8601String(),
            'scheduled_start_at' => $booking->scheduled_start_at?->toIso8601String(),
            'request_expires_at' => $booking->request_expires_at?->toIso8601String(),
        ];
    }
}
