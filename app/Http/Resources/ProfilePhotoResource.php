<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProfilePhotoResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'usage_type' => $this->usage_type,
            'content_hash' => $this->content_hash,
            'status' => $this->status,
            'rejection_reason_code' => $this->rejection_reason_code,
            'sort_order' => $this->sort_order,
            'account' => $this->whenLoaded('account', fn () => [
                'public_id' => $this->account?->public_id,
                'display_name' => $this->account?->display_name,
                'email' => $this->account?->email,
            ]),
            'therapist_profile' => $this->whenLoaded('therapistProfile', fn () => [
                'public_id' => $this->therapistProfile?->public_id,
                'public_name' => $this->therapistProfile?->public_name,
                'profile_status' => $this->therapistProfile?->profile_status,
                'photo_review_status' => $this->therapistProfile?->photo_review_status,
            ]),
            'reviewed_by' => $this->whenLoaded('reviewedBy', fn () => [
                'public_id' => $this->reviewedBy?->public_id,
                'display_name' => $this->reviewedBy?->display_name,
            ]),
            'reviewed_at' => $this->reviewed_at,
            'created_at' => $this->created_at,
        ];
    }
}
