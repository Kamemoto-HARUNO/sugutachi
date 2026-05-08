<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\URL;

class SupportTicketMessageResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $viewerAccountId = $this->resource->getAttribute('viewer_account_id') ?? $request->user()?->id;
        $viewerRole = $this->resource->getAttribute('viewer_role');
        $isAdminViewer = $viewerRole === 'admin';
        $isOwn = $viewerAccountId !== null && $this->sender_account_id === $viewerAccountId;
        $isRead = match ($viewerRole) {
            'admin' => (bool) $this->read_by_admin_at,
            'user', 'therapist' => (bool) $this->read_by_user_at,
            default => false,
        };

        return [
            'id' => $this->id,
            'support_ticket_public_id' => $this->whenLoaded('ticket', fn () => $this->ticket->public_id),
            'sender_role' => $this->sender_role,
            'sender' => $this->whenLoaded('sender', fn () => $this->sender ? [
                'public_id' => $isAdminViewer ? $this->sender->public_id : ($this->sender_role === 'admin' ? null : $this->sender->public_id),
                'display_name' => $this->sender_role === 'admin' && ! $isAdminViewer
                    ? '運営'
                    : $this->sender->display_name,
                'status' => $isAdminViewer ? $this->sender->status : null,
            ] : null),
            'message_type' => $this->message_type,
            'body' => $this->body_encrypted ? Crypt::decryptString($this->body_encrypted) : null,
            'attachment_url' => $this->when(
                $this->attachment_storage_key_encrypted && $this->relationLoaded('ticket') && $this->ticket,
                fn () => URL::temporarySignedRoute('support-ticket-messages.signed-file', now()->addMinutes(30), [
                    'ticket' => $this->ticket->public_id,
                    'message' => $this->id,
                ]),
            ),
            'attachment_original_name' => $this->attachment_original_name,
            'attachment_mime_type' => $this->attachment_mime_type,
            'attachment_size_bytes' => $this->attachment_size_bytes,
            'is_own' => $isOwn,
            'is_read' => $isRead,
            'sent_at' => $this->sent_at,
            'read_by_user_at' => $this->read_by_user_at,
            'read_by_admin_at' => $this->when($isAdminViewer, $this->read_by_admin_at),
        ];
    }
}
