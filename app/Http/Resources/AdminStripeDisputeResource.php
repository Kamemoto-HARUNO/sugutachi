<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AdminStripeDisputeResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'stripe_dispute_id' => $this->stripe_dispute_id,
            'booking_public_id' => $this->whenLoaded('booking', fn () => $this->booking?->public_id),
            'payment_intent' => $this->whenLoaded('paymentIntent', fn () => $this->paymentIntent ? [
                'stripe_payment_intent_id' => $this->paymentIntent->stripe_payment_intent_id,
                'status' => $this->paymentIntent->status,
            ] : null),
            'user_account_id' => $this->whenLoaded('booking', fn () => $this->booking?->userAccount?->public_id),
            'therapist_account_id' => $this->whenLoaded('booking', fn () => $this->booking?->therapistAccount?->public_id),
            'status' => $this->status,
            'reason' => $this->reason,
            'amount' => $this->amount,
            'currency' => $this->currency,
            'evidence_due_by' => $this->evidence_due_by,
            'outcome' => $this->outcome,
            'last_stripe_event_id' => $this->last_stripe_event_id,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
