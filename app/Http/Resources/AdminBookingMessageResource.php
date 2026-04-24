<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class AdminBookingMessageResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'booking_public_id' => $this->whenLoaded('booking', fn () => $this->booking?->public_id),
            'sender' => $this->whenLoaded('sender', fn () => $this->sender ? [
                'public_id' => $this->sender->public_id,
                'display_name' => $this->sender->display_name,
                'email' => $this->sender->email,
            ] : null),
            'message_type' => $this->message_type,
            'body' => Crypt::decryptString($this->body_encrypted),
            'detected_contact_exchange' => $this->detected_contact_exchange,
            'moderation_status' => $this->moderation_status,
            'sent_at' => $this->sent_at,
            'read_at' => $this->read_at,
        ];
    }
}
