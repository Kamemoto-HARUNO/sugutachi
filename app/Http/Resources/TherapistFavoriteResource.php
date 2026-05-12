<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TherapistFavoriteResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $profile = $this->therapistProfile;
        $photo = $profile?->photos?->first();

        return [
            'id' => $this->id,
            'created_at' => $this->created_at,
            'therapist' => [
                'public_id' => $profile?->public_id,
                'public_name' => $profile?->public_name,
                'bio_excerpt' => filled($profile?->bio) ? str($profile->bio)->limit(80)->toString() : null,
                'is_online' => (bool) ($profile?->is_online ?? false),
                'rating_average' => (float) ($profile?->rating_average ?? 0),
                'review_count' => (int) ($profile?->review_count ?? 0),
                'favorite_count' => (int) ($profile?->favorites_count ?? 0),
                'photo' => $photo ? (new PublicProfilePhotoResource($photo))->resolve($request) : null,
            ],
        ];
    }
}
