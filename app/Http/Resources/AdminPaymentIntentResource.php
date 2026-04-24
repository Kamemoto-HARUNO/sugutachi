<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AdminPaymentIntentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'stripe_payment_intent_id' => $this->stripe_payment_intent_id,
            'status' => $this->status,
            'capture_method' => $this->capture_method,
            'currency' => $this->currency,
            'amount' => $this->amount,
            'application_fee_amount' => $this->application_fee_amount,
            'transfer_amount' => $this->transfer_amount,
            'is_current' => $this->is_current,
            'authorized_at' => $this->authorized_at,
            'captured_at' => $this->captured_at,
            'canceled_at' => $this->canceled_at,
            'last_stripe_event_id' => $this->last_stripe_event_id,
        ];
    }
}
