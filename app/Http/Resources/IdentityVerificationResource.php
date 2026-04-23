<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class IdentityVerificationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'provider' => $this->provider,
            'status' => $this->status,
            'birth_year' => $this->birth_year,
            'is_age_verified' => $this->is_age_verified,
            'self_declared_male' => $this->self_declared_male,
            'document_type' => $this->document_type,
            'submitted_at' => $this->submitted_at,
            'reviewed_at' => $this->reviewed_at,
            'rejection_reason_code' => $this->rejection_reason_code,
            'purge_after' => $this->purge_after,
        ];
    }
}
