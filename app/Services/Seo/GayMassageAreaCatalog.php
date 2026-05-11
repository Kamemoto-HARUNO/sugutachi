<?php

namespace App\Services\Seo;

use App\Models\ProfilePhoto;
use App\Models\TherapistAvailabilitySlot;
use App\Models\TherapistProfile;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class GayMassageAreaCatalog
{
    /**
     * Bounds are intentionally coarse for the first SEO rollout. They are only
     * used to decide prefecture-level page eligibility from private base points.
     *
     * @var array<string, array{name: string, code: string, bounds: array{min_lat: float, max_lat: float, min_lng: float, max_lng: float}}>
     */
    private const AREAS = [
        'tokyo' => [
            'name' => '東京',
            'code' => '13',
            'bounds' => ['min_lat' => 35.45, 'max_lat' => 35.95, 'min_lng' => 138.90, 'max_lng' => 140.00],
        ],
        'osaka' => [
            'name' => '大阪',
            'code' => '27',
            'bounds' => ['min_lat' => 34.25, 'max_lat' => 35.05, 'min_lng' => 135.05, 'max_lng' => 135.80],
        ],
        'aichi' => [
            'name' => '愛知',
            'code' => '23',
            'bounds' => ['min_lat' => 34.55, 'max_lat' => 35.45, 'min_lng' => 136.65, 'max_lng' => 137.85],
        ],
        'fukuoka' => [
            'name' => '福岡',
            'code' => '40',
            'bounds' => ['min_lat' => 32.95, 'max_lat' => 34.30, 'min_lng' => 129.95, 'max_lng' => 131.35],
        ],
    ];

    public function allAreas(): Collection
    {
        return collect(self::AREAS)->map(fn (array $area, string $slug): array => [
            'slug' => $slug,
            'name' => $area['name'],
            'code' => $area['code'],
        ])->values();
    }

    public function findArea(string $slug): ?array
    {
        $normalized = Str::slug($slug);

        if (! array_key_exists($normalized, self::AREAS)) {
            return null;
        }

        return [
            'slug' => $normalized,
            'name' => self::AREAS[$normalized]['name'],
            'code' => self::AREAS[$normalized]['code'],
        ];
    }

    public function activeAreas(): Collection
    {
        return $this->allAreas()
            ->filter(fn (array $area): bool => $this->therapistCount($area['slug']) > 0)
            ->values();
    }

    public function therapistCount(string $slug): int
    {
        return $this->therapistsForArea($slug)->count();
    }

    public function therapistsForArea(string $slug, int $limit = 12): Collection
    {
        if (! array_key_exists($slug, self::AREAS)) {
            return collect();
        }

        $bounds = self::AREAS[$slug]['bounds'];

        return TherapistProfile::query()
            ->publiclyViewable()
            ->with([
                'account.latestIdentityVerification',
                'bookingSetting',
                'location',
                'availabilitySlots' => fn ($query) => $query
                    ->where('status', TherapistAvailabilitySlot::STATUS_PUBLISHED)
                    ->where('end_at', '>', now())
                    ->orderBy('start_at'),
                'photos' => fn ($query) => $query
                    ->where('status', ProfilePhoto::STATUS_APPROVED)
                    ->where('visibility', ProfilePhoto::VISIBILITY_PUBLIC)
                    ->orderBy('sort_order')
                    ->orderBy('id'),
            ])
            ->where(function (Builder $query) use ($bounds): void {
                $query
                    ->whereHas('location', fn (Builder $location) => $this->wherePointInBounds($location, 'lat', 'lng', $bounds))
                    ->orWhereHas('bookingSetting', fn (Builder $bookingSetting) => $this->wherePointInBounds($bookingSetting, 'scheduled_base_lat', 'scheduled_base_lng', $bounds))
                    ->orWhereHas('availabilitySlots', fn (Builder $slot) => $slot
                        ->where('status', TherapistAvailabilitySlot::STATUS_PUBLISHED)
                        ->where('end_at', '>', now())
                        ->where(function (Builder $slot) use ($bounds): void {
                            $this->wherePointInBounds($slot, 'custom_dispatch_base_lat', 'custom_dispatch_base_lng', $bounds);
                        }));
            })
            ->orderByDesc('is_online')
            ->orderByDesc('rating_average')
            ->orderByDesc('review_count')
            ->orderBy('id')
            ->limit($limit)
            ->get();
    }

    /**
     * @param array{min_lat: float, max_lat: float, min_lng: float, max_lng: float} $bounds
     */
    private function wherePointInBounds(Builder $query, string $latColumn, string $lngColumn, array $bounds): void
    {
        $query
            ->whereBetween($latColumn, [$bounds['min_lat'], $bounds['max_lat']])
            ->whereBetween($lngColumn, [$bounds['min_lng'], $bounds['max_lng']]);
    }
}
