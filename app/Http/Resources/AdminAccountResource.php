<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AdminAccountResource extends JsonResource
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
            'suspended_at' => $this->suspended_at,
            'suspension_reason' => $this->suspension_reason,
            'roles' => $this->whenLoaded('roleAssignments', fn () => $this->roleAssignments
                ->map(fn ($role) => [
                    'role' => $role->role,
                    'status' => $role->status,
                    'granted_at' => $role->granted_at,
                    'revoked_at' => $role->revoked_at,
                ])
                ->values()),
            'latest_identity_verification' => $this->whenLoaded('latestIdentityVerification', fn () => $this->latestIdentityVerification ? [
                'status' => $this->latestIdentityVerification->status,
                'is_age_verified' => $this->latestIdentityVerification->is_age_verified,
                'submitted_at' => $this->latestIdentityVerification->submitted_at,
                'reviewed_at' => $this->latestIdentityVerification->reviewed_at,
            ] : null),
            'user_profile' => $this->whenLoaded('userProfile', fn () => $this->userProfile ? [
                'profile_status' => $this->userProfile->profile_status,
                'age_range' => $this->userProfile->age_range,
                'body_type' => $this->userProfile->body_type,
                'height_cm' => $this->userProfile->height_cm,
                'weight_range' => $this->userProfile->weight_range,
                'sexual_orientation' => $this->userProfile->sexual_orientation,
                'gender_identity' => $this->userProfile->gender_identity,
                'disclose_sensitive_profile_to_therapist' => $this->userProfile->disclose_sensitive_profile_to_therapist,
            ] : null),
            'therapist_profile' => $this->whenLoaded('therapistProfile', fn () => $this->therapistProfile ? [
                'public_id' => $this->therapistProfile->public_id,
                'public_name' => $this->therapistProfile->public_name,
                'profile_status' => $this->therapistProfile->profile_status,
                'photo_review_status' => $this->therapistProfile->photo_review_status,
                'is_online' => $this->therapistProfile->is_online,
            ] : null),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
