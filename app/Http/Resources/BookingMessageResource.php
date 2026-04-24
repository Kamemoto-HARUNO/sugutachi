<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class BookingMessageResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $viewerAccountId = $this->resource->getAttribute('viewer_account_id') ?? $request->user()?->id;

        return [
            'id' => $this->id,
            'booking_public_id' => $this->whenLoaded('booking', fn () => $this->booking->public_id),
            'sender_account_id' => $this->sender?->public_id,
            'sender' => $this->whenLoaded('sender', fn () => $this->sender ? [
                'public_id' => $this->sender->public_id,
                'display_name' => $this->sender->display_name,
                'status' => $this->sender->status,
            ] : null),
            'sender_role' => $this->whenLoaded('booking', fn () => match ($this->sender_account_id) {
                $this->booking?->user_account_id => 'user',
                $this->booking?->therapist_account_id => 'therapist',
                default => null,
            }),
            'message_type' => $this->message_type,
            'body' => Crypt::decryptString($this->body_encrypted),
            'detected_contact_exchange' => $this->detected_contact_exchange,
            'moderation_status' => $this->moderation_status,
            'is_own' => $viewerAccountId !== null ? $this->sender_account_id === $viewerAccountId : null,
            'is_read' => (bool) $this->read_at,
            'sent_at' => $this->sent_at,
            'read_at' => $this->read_at,
        ];
    }
}
