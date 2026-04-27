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
            'therapist_account' => $this->whenLoaded('therapistAccount', fn () => [
                'public_id' => $this->therapistAccount?->public_id,
                'display_name' => $this->therapistAccount?->display_name,
            ]),
            'stripe_connected_account' => $this->whenLoaded('stripeConnectedAccount', fn () => [
                'payout_method' => $this->stripeConnectedAccount?->payout_method,
                'stripe_account_id' => $this->stripeConnectedAccount?->usesStripeConnect()
                    ? $this->stripeConnectedAccount?->stripe_account_id
                    : null,
                'status' => $this->stripeConnectedAccount?->status,
                'payouts_enabled' => $this->stripeConnectedAccount?->payouts_enabled,
                'bank_name' => $this->stripeConnectedAccount?->bank_name,
                'bank_branch_name' => $this->stripeConnectedAccount?->bank_branch_name,
                'bank_account_type' => $this->stripeConnectedAccount?->bank_account_type,
                'bank_account_number' => $this->stripeConnectedAccount?->bank_account_number,
                'bank_account_number_masked' => $this->stripeConnectedAccount?->maskedBankAccountNumber(),
                'bank_account_holder_name' => $this->stripeConnectedAccount?->bank_account_holder_name,
            ]),
            'ledger_entries' => TherapistLedgerEntryResource::collection($this->whenLoaded('ledgerEntries')),
            'created_at' => $this->created_at,
        ];
    }
}
