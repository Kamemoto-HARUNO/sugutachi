<?php

namespace App\Http\Resources;

use App\Models\StripeConnectedAccount;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class StripeConnectedAccountResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        /** @var StripeConnectedAccount|null $connectedAccount */
        $connectedAccount = $this->resource;

        return [
            'has_account' => $connectedAccount !== null,
            'payout_method' => $connectedAccount?->payout_method,
            'stripe_account_id' => $connectedAccount?->usesStripeConnect()
                ? $connectedAccount->stripe_account_id
                : null,
            'account_type' => $connectedAccount?->account_type,
            'status' => $connectedAccount?->status,
            'charges_enabled' => $connectedAccount?->charges_enabled ?? false,
            'payouts_enabled' => $connectedAccount?->payouts_enabled ?? false,
            'details_submitted' => $connectedAccount?->details_submitted ?? false,
            'is_payout_ready' => $connectedAccount?->isPayoutReady() ?? false,
            'requirements_currently_due' => $connectedAccount?->requirements_currently_due_json ?? [],
            'requirements_past_due' => $connectedAccount?->requirements_past_due_json ?? [],
            'disabled_reason' => $connectedAccount?->disabled_reason,
            'onboarding_completed_at' => $connectedAccount?->onboarding_completed_at,
            'last_synced_at' => $connectedAccount?->last_synced_at,
            'bank_account' => $connectedAccount ? [
                'bank_name' => $connectedAccount->bank_name,
                'branch_name' => $connectedAccount->bank_branch_name,
                'account_type' => $connectedAccount->bank_account_type,
                'account_number' => $connectedAccount->bank_account_number,
                'account_number_masked' => $connectedAccount->maskedBankAccountNumber(),
                'account_holder_name' => $connectedAccount->bank_account_holder_name,
            ] : null,
        ];
    }
}
