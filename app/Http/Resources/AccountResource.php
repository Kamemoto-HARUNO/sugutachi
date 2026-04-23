<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AccountResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'public_id' => $this->public_id,
            'email' => $this->email,
            'phone_e164' => $this->phone_e164,
            'display_name' => $this->display_name,
            'status' => $this->status,
            'last_active_role' => $this->last_active_role,
            'roles' => $this->whenLoaded('roleAssignments', fn () => $this->roleAssignments
                ->map(fn ($role) => [
                    'role' => $role->role,
                    'status' => $role->status,
                ])
                ->values()),
            'latest_identity_verification' => $this->whenLoaded('latestIdentityVerification', fn () => $this->latestIdentityVerification ? [
                'status' => $this->latestIdentityVerification->status,
                'is_age_verified' => $this->latestIdentityVerification->is_age_verified,
                'submitted_at' => $this->latestIdentityVerification->submitted_at,
            ] : null),
            'created_at' => $this->created_at,
        ];
    }
}
