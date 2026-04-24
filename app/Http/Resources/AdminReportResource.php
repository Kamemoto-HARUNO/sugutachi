<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class AdminReportResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'public_id' => $this->public_id,
            'booking_public_id' => $this->whenLoaded('booking', fn () => $this->booking?->public_id),
            'source_booking_message' => $this->whenLoaded('sourceBookingMessage', fn () => $this->sourceBookingMessage ? [
                'id' => $this->sourceBookingMessage->id,
                'message_type' => $this->sourceBookingMessage->message_type,
                'sender_account_public_id' => $this->sourceBookingMessage->sender?->public_id,
                'detected_contact_exchange' => $this->sourceBookingMessage->detected_contact_exchange,
                'moderation_status' => $this->sourceBookingMessage->moderation_status,
                'sent_at' => $this->sourceBookingMessage->sent_at,
            ] : null),
            'reporter_account' => $this->whenLoaded('reporter', fn () => [
                'public_id' => $this->reporter?->public_id,
                'display_name' => $this->reporter?->display_name,
                'email' => $this->reporter?->email,
            ]),
            'target_account' => $this->whenLoaded('target', fn () => [
                'public_id' => $this->target?->public_id,
                'display_name' => $this->target?->display_name,
                'email' => $this->target?->email,
            ]),
            'assigned_admin' => $this->whenLoaded('assignedAdmin', fn () => [
                'public_id' => $this->assignedAdmin?->public_id,
                'display_name' => $this->assignedAdmin?->display_name,
            ]),
            'category' => $this->category,
            'severity' => $this->severity,
            'detail' => $this->detail_encrypted ? Crypt::decryptString($this->detail_encrypted) : null,
            'status' => $this->status,
            'resolved_at' => $this->resolved_at,
            'actions' => ReportActionResource::collection($this->whenLoaded('actions')),
            'created_at' => $this->created_at,
        ];
    }
}
