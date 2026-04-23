<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TherapistProfileResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'public_id' => $this->public_id,
            'public_name' => $this->public_name,
            'bio' => $this->bio,
            'profile_status' => $this->profile_status,
            'training_status' => $this->training_status,
            'photo_review_status' => $this->photo_review_status,
            'is_online' => $this->is_online,
            'online_since' => $this->online_since,
            'last_location_updated_at' => $this->last_location_updated_at,
            'rating_average' => $this->rating_average,
            'review_count' => $this->review_count,
            'menus' => $this->whenLoaded('menus', fn () => TherapistMenuResource::collection($this->menus)),
        ];
    }
}
