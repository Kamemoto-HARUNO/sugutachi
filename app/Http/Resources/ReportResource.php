<?php

namespace App\Http\Resources;

use App\Models\DirectMessageThread;
use App\Services\DirectMessages\ParticipantPresenter;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class ReportResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $includeDetail = (bool) $this->resource->getAttribute('include_detail');

        $reporterRole = $this->reporter_role ?: ($this->booking ? $this->booking->messageParticipantRoleForAccountId($this->reporter_account_id) : null);
        $targetRole = $reporterRole === 'user' ? 'therapist' : ($reporterRole === 'therapist' ? 'user' : null);
        $presenter = app(ParticipantPresenter::class);

        return [
            'public_id' => $this->public_id,
            'booking_public_id' => $this->booking?->public_id,
            'direct_message_thread_id' => $this->direct_message_thread_id ? DirectMessageThread::find($this->direct_message_thread_id)?->public_id : null,
            'source_booking_message' => $this->sourceBookingMessage ? [
                'id' => $this->sourceBookingMessage->id,
                'sender' => $this->sourceBookingMessage->sender && $this->booking ? $presenter->present($this->sourceBookingMessage->sender, $this->booking->messageParticipantRoleForAccountId($this->sourceBookingMessage->sender_account_id)) : null,
                'moderation_status' => $this->sourceBookingMessage->moderation_status,
                'detected_contact_exchange' => $this->sourceBookingMessage->detected_contact_exchange,
                'sent_at' => $this->sourceBookingMessage->sent_at,
            ] : null,
            'reporter_profile' => $this->reporter && $reporterRole ? $presenter->present($this->reporter, $reporterRole) : null,
            'target_profile' => $this->target && $targetRole ? $presenter->present($this->target, $targetRole) : null,
            'category' => $this->category,
            'severity' => $this->severity,
            'status' => $this->status,
            'detail' => $this->when(
                $includeDetail,
                fn () => $this->detail_encrypted ? Crypt::decryptString($this->detail_encrypted) : null
            ),
            'resolved_at' => $this->resolved_at,
            'created_at' => $this->created_at,
        ];
    }
}
