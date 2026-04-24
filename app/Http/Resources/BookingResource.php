<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class BookingResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'public_id' => $this->public_id,
            'status' => $this->status,
            'is_on_demand' => $this->is_on_demand,
            'availability_slot_id' => $this->currentQuote?->input_snapshot_json['availability_slot_id']
                ?? $this->whenLoaded('availabilitySlot', fn () => $this->availabilitySlot?->public_id),
            'requested_start_at' => $this->requested_start_at,
            'scheduled_start_at' => $this->scheduled_start_at,
            'scheduled_end_at' => $this->scheduled_end_at,
            'duration_minutes' => $this->duration_minutes,
            'buffer_before_minutes' => $this->buffer_before_minutes,
            'buffer_after_minutes' => $this->buffer_after_minutes,
            'request_expires_at' => $this->request_expires_at,
            'accepted_at' => $this->accepted_at,
            'confirmed_at' => $this->confirmed_at,
            'moving_at' => $this->moving_at,
            'arrived_at' => $this->arrived_at,
            'started_at' => $this->started_at,
            'ended_at' => $this->ended_at,
            'canceled_at' => $this->canceled_at,
            'cancel_reason_code' => $this->cancel_reason_code,
            'cancel_reason_note' => $this->cancel_reason_note_encrypted
                ? rescue(fn () => Crypt::decryptString($this->cancel_reason_note_encrypted), null, false)
                : null,
            'total_amount' => $this->total_amount,
            'therapist_net_amount' => $this->therapist_net_amount,
            'platform_fee_amount' => $this->platform_fee_amount,
            'matching_fee_amount' => $this->matching_fee_amount,
            'current_quote' => $this->whenLoaded('currentQuote', fn () => new BookingQuoteResource($this->currentQuote)),
            'created_at' => $this->created_at,
        ];
    }
}
