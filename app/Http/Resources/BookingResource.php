<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BookingResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'public_id' => $this->public_id,
            'status' => $this->status,
            'is_on_demand' => $this->is_on_demand,
            'requested_start_at' => $this->requested_start_at,
            'scheduled_start_at' => $this->scheduled_start_at,
            'scheduled_end_at' => $this->scheduled_end_at,
            'duration_minutes' => $this->duration_minutes,
            'request_expires_at' => $this->request_expires_at,
            'accepted_at' => $this->accepted_at,
            'confirmed_at' => $this->confirmed_at,
            'moving_at' => $this->moving_at,
            'arrived_at' => $this->arrived_at,
            'started_at' => $this->started_at,
            'ended_at' => $this->ended_at,
            'canceled_at' => $this->canceled_at,
            'cancel_reason_code' => $this->cancel_reason_code,
            'total_amount' => $this->total_amount,
            'therapist_net_amount' => $this->therapist_net_amount,
            'platform_fee_amount' => $this->platform_fee_amount,
            'matching_fee_amount' => $this->matching_fee_amount,
            'current_quote' => $this->whenLoaded('currentQuote', fn () => new BookingQuoteResource($this->currentQuote)),
            'created_at' => $this->created_at,
        ];
    }
}
