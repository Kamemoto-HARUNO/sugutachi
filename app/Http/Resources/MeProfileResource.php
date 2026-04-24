<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MeProfileResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'public_id' => $this->public_id,
            'email' => $this->email,
            'phone_e164' => $this->phone_e164,
            'phone_verified_at' => $this->phone_verified_at,
            'display_name' => $this->display_name,
            'status' => $this->status,
            'last_active_role' => $this->last_active_role,
            'roles' => $this->whenLoaded('roleAssignments', fn () => $this->roleAssignments
                ->map(fn ($role) => [
                    'role' => $role->role,
                    'status' => $role->status,
                    'granted_at' => $role->granted_at,
                ])
                ->values()),
            'latest_identity_verification' => $this->whenLoaded('latestIdentityVerification', fn () => $this->latestIdentityVerification ? [
                'status' => $this->latestIdentityVerification->status,
                'is_age_verified' => $this->latestIdentityVerification->is_age_verified,
                'submitted_at' => $this->latestIdentityVerification->submitted_at,
                'reviewed_at' => $this->latestIdentityVerification->reviewed_at,
            ] : null),
            'photos' => SelfProfilePhotoResource::collection($this->whenLoaded('profilePhotos')),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
