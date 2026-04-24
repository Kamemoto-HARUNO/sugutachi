<?php

namespace App\Http\Resources;

use App\Models\Refund;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BookingRefundResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'public_id' => $this->public_id,
            'status' => $this->status,
            'reason_code' => $this->reason_code,
            'is_auto' => $this->reason_code === Refund::REASON_CODE_BOOKING_CANCELLATION_AUTO,
            'requested_amount' => $this->requested_amount,
            'approved_amount' => $this->approved_amount,
            'processed_amount' => $this->status === Refund::STATUS_PROCESSED
                ? ($this->approved_amount ?? $this->requested_amount ?? 0)
                : 0,
            'processed_at' => $this->processed_at,
            'created_at' => $this->created_at,
        ];
    }
}
