<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PayoutRequestResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'public_id' => $this->public_id,
            'status' => $this->status,
            'requested_amount' => $this->requested_amount,
            'fee_amount' => $this->fee_amount,
            'net_amount' => $this->net_amount,
            'requested_at' => $this->requested_at,
            'scheduled_process_date' => $this->scheduled_process_date,
            'processed_at' => $this->processed_at,
            'stripe_payout_id' => $this->stripe_payout_id,
            'failure_reason' => $this->failure_reason,
            'ledger_entries' => TherapistLedgerEntryResource::collection($this->whenLoaded('ledgerEntries')),
            'created_at' => $this->created_at,
        ];
    }
}
