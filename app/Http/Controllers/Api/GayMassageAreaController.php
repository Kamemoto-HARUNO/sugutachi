<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PublicTherapistSearchResultResource;
use App\Models\TherapistProfile;
use App\Services\Seo\GayMassageAreaCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class GayMassageAreaController extends Controller
{
    public function index(GayMassageAreaCatalog $catalog): JsonResponse
    {
        return response()->json([
            'data' => [
                'areas' => $catalog->activeAreas()->values(),
            ],
        ]);
    }

    public function show(string $slug, GayMassageAreaCatalog $catalog): JsonResponse
    {
        $area = $catalog->findArea($slug);

        if (! $area) {
            abort(404);
        }

        $profiles = $catalog->therapistsForArea($area['slug']);

        if ($profiles->isEmpty()) {
            abort(404);
        }

        return response()->json([
            'data' => [
                'area' => [
                    ...$area,
                    'therapist_count' => $profiles->count(),
                ],
                'therapists' => PublicTherapistSearchResultResource::collection(
                    $profiles->map(fn (TherapistProfile $profile): array => $this->profileSummary($profile))
                )->resolve(),
            ],
        ]);
    }

    private function profileSummary(TherapistProfile $profile): array
    {
        $identityVerification = $profile->account?->latestIdentityVerification;

        return [
            'public_id' => $profile->public_id,
            'public_name' => $profile->public_name,
            'bio_excerpt' => filled($profile->bio) ? Str::limit($profile->bio, 80, '...') : null,
            'age' => $identityVerification?->resolvedAge(),
            'height_cm' => $profile->height_cm === null ? null : (int) $profile->height_cm,
            'weight_kg' => $profile->weight_kg === null ? null : (int) $profile->weight_kg,
            'p_size_cm' => $profile->p_size_cm === null ? null : (int) $profile->p_size_cm,
            'training_status' => $profile->training_status,
            'rating_average' => (float) $profile->rating_average,
            'review_count' => $profile->review_count,
            'therapist_cancellation_count' => (int) $profile->therapist_cancellation_count,
            'is_online' => (bool) $profile->is_online,
            'travel_mode' => $profile->bookingSetting?->travel_mode,
            'walking_time_range' => null,
            'estimated_total_amount' => null,
            'photos' => Collection::make($profile->photos)->take(1),
        ];
    }
}
