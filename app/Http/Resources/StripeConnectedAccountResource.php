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
            'stripe_account_id' => $connectedAccount?->stripe_account_id,
            'account_type' => $connectedAccount?->account_type,
            'status' => $connectedAccount?->status,
            'charges_enabled' => $connectedAccount?->charges_enabled ?? false,
            'payouts_enabled' => $connectedAccount?->payouts_enabled ?? false,
            'details_submitted' => $connectedAccount?->details_submitted ?? false,
            'requirements_currently_due' => $connectedAccount?->requirements_currently_due_json ?? [],
            'requirements_past_due' => $connectedAccount?->requirements_past_due_json ?? [],
            'disabled_reason' => $connectedAccount?->disabled_reason,
            'onboarding_completed_at' => $connectedAccount?->onboarding_completed_at,
            'last_synced_at' => $connectedAccount?->last_synced_at,
        ];
    }
}
