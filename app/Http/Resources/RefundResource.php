<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RefundResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'public_id' => $this->public_id,
            'booking_public_id' => $this->whenLoaded('booking', fn () => $this->booking->public_id),
            'requested_by_account_id' => $this->whenLoaded('requestedBy', fn () => $this->requestedBy?->public_id),
            'reviewed_by_account_id' => $this->whenLoaded('reviewedBy', fn () => $this->reviewedBy?->public_id),
            'status' => $this->status,
            'reason_code' => $this->reason_code,
            'requested_amount' => $this->requested_amount,
            'approved_amount' => $this->approved_amount,
            'stripe_refund_id' => $this->stripe_refund_id,
            'reviewed_at' => $this->reviewed_at,
            'processed_at' => $this->processed_at,
            'created_at' => $this->created_at,
        ];
    }
}
