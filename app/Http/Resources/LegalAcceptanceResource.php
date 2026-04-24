<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LegalAcceptanceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'legal_document' => $this->whenLoaded('legalDocument', fn () => [
                'public_id' => $this->legalDocument?->public_id,
                'document_type' => $this->legalDocument?->document_type,
                'version' => $this->legalDocument?->version,
                'title' => $this->legalDocument?->title,
            ]),
            'accepted_at' => $this->accepted_at,
            'created_at' => $this->created_at,
        ];
    }
}
