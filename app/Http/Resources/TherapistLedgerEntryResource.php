<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TherapistLedgerEntryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'booking_public_id' => $this->whenLoaded('booking', fn () => $this->booking?->public_id),
            'payout_request_id' => $this->whenLoaded('payoutRequest', fn () => $this->payoutRequest?->public_id),
            'entry_type' => $this->entry_type,
            'amount_signed' => $this->amount_signed,
            'status' => $this->status,
            'available_at' => $this->available_at,
            'description' => $this->description,
            'metadata' => $this->metadata_json,
            'created_at' => $this->created_at,
        ];
    }
}
