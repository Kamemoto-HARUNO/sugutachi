<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ReportResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'public_id' => $this->public_id,
            'booking_public_id' => $this->whenLoaded('booking', fn () => $this->booking?->public_id),
            'source_booking_message' => $this->whenLoaded('sourceBookingMessage', fn () => $this->sourceBookingMessage ? [
                'id' => $this->sourceBookingMessage->id,
                'moderation_status' => $this->sourceBookingMessage->moderation_status,
                'detected_contact_exchange' => $this->sourceBookingMessage->detected_contact_exchange,
                'sent_at' => $this->sourceBookingMessage->sent_at,
            ] : null),
            'reporter_account_id' => $this->reporter?->public_id,
            'target_account_id' => $this->target?->public_id,
            'assigned_admin_account_id' => $this->assignedAdmin?->public_id,
            'category' => $this->category,
            'severity' => $this->severity,
            'status' => $this->status,
            'resolved_at' => $this->resolved_at,
            'created_at' => $this->created_at,
        ];
    }
}
