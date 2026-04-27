<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\URL;

class SelfProfilePhotoResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'usage_type' => $this->usage_type,
            'status' => $this->status,
            'rejection_reason_code' => $this->rejection_reason_code,
            'sort_order' => $this->sort_order,
            'url' => URL::temporarySignedRoute('profile-photos.signed-file', now()->addMinutes(30), [
                'profilePhoto' => $this->id,
            ]),
            'therapist_profile' => $this->whenLoaded('therapistProfile', fn () => [
                'public_id' => $this->therapistProfile?->public_id,
                'public_name' => $this->therapistProfile?->public_name,
                'photo_review_status' => $this->therapistProfile?->photo_review_status,
            ]),
            'created_at' => $this->created_at,
        ];
    }
}
