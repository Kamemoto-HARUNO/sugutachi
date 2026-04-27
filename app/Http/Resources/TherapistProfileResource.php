<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TherapistProfileResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $ratingAverage = $this->rating_average;
        $identityVerification = $this->account?->latestIdentityVerification;

        return [
            'public_id' => $this->public_id,
            'public_name' => $this->public_name,
            'bio' => $this->bio,
            'age' => $identityVerification?->resolvedAge(),
            'height_cm' => $this->height_cm === null ? null : (int) $this->height_cm,
            'weight_kg' => $this->weight_kg === null ? null : (int) $this->weight_kg,
            'p_size_cm' => $this->p_size_cm === null ? null : (int) $this->p_size_cm,
            'profile_status' => $this->profile_status,
            'training_status' => $this->training_status,
            'photo_review_status' => $this->photo_review_status,
            'account' => $this->whenLoaded('account', fn () => [
                'public_id' => $this->account?->public_id,
                'display_name' => $this->account?->display_name,
                'email' => $this->account?->email,
            ]),
            'is_online' => $this->is_online,
            'is_listed' => $this->is_listed,
            'online_since' => $this->online_since,
            'last_location_updated_at' => $this->last_location_updated_at,
            'rating_average' => $ratingAverage === null ? null : (float) $ratingAverage,
            'review_count' => (int) $this->review_count,
            'approved_at' => $this->approved_at,
            'approved_by' => $this->whenLoaded('approvedBy', fn () => [
                'public_id' => $this->approvedBy?->public_id,
                'display_name' => $this->approvedBy?->display_name,
            ]),
            'rejected_reason_code' => $this->rejected_reason_code,
            'menus' => $this->whenLoaded('menus', fn () => TherapistMenuResource::collection($this->menus)),
        ];
    }
}
