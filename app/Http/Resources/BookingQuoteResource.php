<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BookingQuoteResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'quote_id' => $this->public_id,
            'expires_at' => $this->expires_at,
            'is_on_demand' => $this->input_snapshot_json['is_on_demand'] ?? true,
            'requested_start_at' => $this->input_snapshot_json['requested_start_at'] ?? null,
            'availability_slot_id' => $this->input_snapshot_json['availability_slot_id'] ?? null,
            'amounts' => [
                'base_amount' => $this->base_amount,
                'travel_fee_amount' => $this->travel_fee_amount,
                'night_fee_amount' => $this->night_fee_amount,
                'demand_fee_amount' => $this->demand_fee_amount,
                'profile_adjustment_amount' => $this->profile_adjustment_amount,
                'matching_fee_amount' => $this->matching_fee_amount,
                'platform_fee_amount' => $this->platform_fee_amount,
                'total_amount' => $this->total_amount,
                'therapist_gross_amount' => $this->therapist_gross_amount,
                'therapist_net_amount' => $this->therapist_net_amount,
            ],
            'walking_time_range' => $this->input_snapshot_json['walking_time_range'] ?? null,
        ];
    }
}
