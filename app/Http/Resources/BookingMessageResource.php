<?php

namespace App\Http\Resources;

use App\Services\DirectMessages\ParticipantPresenter;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\URL;

class BookingMessageResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $viewerAccountId = $this->resource->getAttribute('viewer_account_id') ?? $request->user()?->id;
        $isDeleted = $this->message_type === 'image' && ! $this->attachment_storage_key_encrypted;
        $viewerRole = $this->relationLoaded('booking') && $this->booking
            ? $this->booking->messageParticipantRoleForAccountId($viewerAccountId)
            : null;
        $senderRole = $this->booking?->messageParticipantRoleForAccountId($this->sender_account_id);
        $sender = $senderRole && $this->sender ? app(ParticipantPresenter::class)->present($this->sender, $senderRole) : null;
        $canDeleteImage = ! $isDeleted
            && $this->message_type === 'image'
            && $viewerAccountId !== null
            && $this->sender_account_id === $viewerAccountId
            && (
                ! $this->relationLoaded('booking')
                || ! $this->booking
                || $this->booking->canSendMessagesForRole($viewerRole)
            );

        return [
            'id' => $this->id,
            'booking_public_id' => $this->whenLoaded('booking', fn () => $this->booking->public_id),
            'sender_profile_id' => $sender['public_id'] ?? null,
            'sender' => $sender,
            'sender_role' => $this->whenLoaded('booking', fn () => match ($this->sender_account_id) {
                $this->booking?->user_account_id => 'user',
                $this->booking?->therapist_account_id => 'therapist',
                default => null,
            }),
            'message_type' => $this->message_type,
            'body' => Crypt::decryptString($this->body_encrypted),
            'attachment_url' => $this->when(
                $this->attachment_storage_key_encrypted && $this->relationLoaded('booking') && $this->booking,
                fn () => URL::temporarySignedRoute('booking-messages.signed-file', now()->addMinutes(30), [
                    'booking' => $this->booking->public_id,
                    'message' => $this->id,
                    'viewer_role' => $viewerRole,
                ]),
            ),
            'attachment_original_name' => $this->attachment_storage_key_encrypted ? 'image' : null,
            'attachment_mime_type' => $this->attachment_mime_type,
            'attachment_size_bytes' => $this->attachment_size_bytes,
            'is_deleted' => $isDeleted,
            'can_delete_image' => $canDeleteImage,
            'detected_contact_exchange' => $this->detected_contact_exchange,
            'moderation_status' => $this->moderation_status,
            'is_own' => $viewerAccountId !== null ? $this->sender_account_id === $viewerAccountId : null,
            'is_read' => (bool) $this->read_at,
            'sent_at' => $this->sent_at,
            'read_at' => $this->read_at,
        ];
    }
}
