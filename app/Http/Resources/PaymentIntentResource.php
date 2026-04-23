<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PaymentIntentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'stripe_payment_intent_id' => $this->stripe_payment_intent_id,
            'client_secret' => $this->client_secret,
            'status' => $this->status,
            'capture_method' => $this->capture_method,
            'currency' => $this->currency,
            'amount' => $this->amount,
            'application_fee_amount' => $this->application_fee_amount,
            'transfer_amount' => $this->transfer_amount,
            'is_current' => $this->is_current,
        ];
    }
}
