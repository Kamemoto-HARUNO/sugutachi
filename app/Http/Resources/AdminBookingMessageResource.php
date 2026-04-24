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
            'moderated_by_admin' => $this->whenLoaded('moderatedByAdmin', fn () => $this->moderatedByAdmin ? [
                'public_id' => $this->moderatedByAdmin->public_id,
                'display_name' => $this->moderatedByAdmin->display_name,
            ] : null),
            'moderated_at' => $this->moderated_at,
            'admin_note_count' => $this->when(isset($this->admin_notes_count), $this->admin_notes_count),
            'open_report_count' => $this->when(isset($this->open_report_count), $this->open_report_count),
            'notes' => AdminNoteResource::collection($this->whenLoaded('adminNotes')),
            'sent_at' => $this->sent_at,
            'read_at' => $this->read_at,
        ];
    }
}
