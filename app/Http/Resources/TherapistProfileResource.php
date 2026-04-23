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
            'account' => $this->whenLoaded('account', fn () => [
                'public_id' => $this->account?->public_id,
                'display_name' => $this->account?->display_name,
                'email' => $this->account?->email,
            ]),
            'is_online' => $this->is_online,
            'online_since' => $this->online_since,
            'last_location_updated_at' => $this->last_location_updated_at,
            'rating_average' => $this->rating_average,
            'review_count' => $this->review_count,
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
