<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AdminBookingConsentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'booking_public_id' => $this->whenLoaded('booking', fn () => $this->booking?->public_id),
            'account' => $this->whenLoaded('account', fn () => $this->account ? [
                'public_id' => $this->account->public_id,
                'display_name' => $this->account->display_name,
                'email' => $this->account->email,
                'status' => $this->account->status,
            ] : null),
            'consent_type' => $this->consent_type,
            'legal_document' => $this->whenLoaded('legalDocument', fn () => $this->legalDocument ? [
                'public_id' => $this->legalDocument->public_id,
                'document_type' => $this->legalDocument->document_type,
                'version' => $this->legalDocument->version,
                'title' => $this->legalDocument->title,
            ] : null),
            'consented_at' => $this->consented_at,
            'created_at' => $this->created_at,
        ];
    }
}
