<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class IdentityVerificationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'provider' => $this->provider,
            'status' => $this->status,
            'account' => $this->whenLoaded('account', fn () => [
                'public_id' => $this->account?->public_id,
                'display_name' => $this->account?->display_name,
                'email' => $this->account?->email,
            ]),
            'birth_year' => $this->birth_year,
            'is_age_verified' => $this->is_age_verified,
            'self_declared_male' => $this->self_declared_male,
            'document_type' => $this->document_type,
            'submitted_at' => $this->submitted_at,
            'reviewed_by' => $this->whenLoaded('reviewedBy', fn () => [
                'public_id' => $this->reviewedBy?->public_id,
                'display_name' => $this->reviewedBy?->display_name,
            ]),
            'reviewed_at' => $this->reviewed_at,
            'rejection_reason_code' => $this->rejection_reason_code,
            'purge_after' => $this->purge_after,
        ];
    }
}
