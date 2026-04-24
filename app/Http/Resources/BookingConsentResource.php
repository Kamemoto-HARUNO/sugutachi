<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BookingConsentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'booking_public_id' => $this->whenLoaded('booking', fn () => $this->booking?->public_id),
            'account_id' => $this->whenLoaded('account', fn () => $this->account?->public_id),
            'consent_type' => $this->consent_type,
            'legal_document_public_id' => $this->whenLoaded('legalDocument', fn () => $this->legalDocument?->public_id),
            'legal_document_type' => $this->whenLoaded('legalDocument', fn () => $this->legalDocument?->document_type),
            'consented_at' => $this->consented_at,
            'created_at' => $this->created_at,
        ];
    }
}
