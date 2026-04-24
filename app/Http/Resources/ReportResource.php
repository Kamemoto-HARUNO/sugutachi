<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class ReportResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $includeDetail = (bool) $this->resource->getAttribute('include_detail');

        return [
            'public_id' => $this->public_id,
            'booking_public_id' => $this->whenLoaded('booking', fn () => $this->booking?->public_id),
            'source_booking_message' => $this->whenLoaded('sourceBookingMessage', fn () => $this->sourceBookingMessage ? [
                'id' => $this->sourceBookingMessage->id,
                'sender' => $this->sourceBookingMessage->relationLoaded('sender') ? [
                    'public_id' => $this->sourceBookingMessage->sender?->public_id,
                    'display_name' => $this->sourceBookingMessage->sender?->display_name,
                ] : null,
                'moderation_status' => $this->sourceBookingMessage->moderation_status,
                'detected_contact_exchange' => $this->sourceBookingMessage->detected_contact_exchange,
                'sent_at' => $this->sourceBookingMessage->sent_at,
            ] : null),
            'reporter_account_id' => $this->reporter?->public_id,
            'reporter_account' => $this->whenLoaded('reporter', fn () => $this->reporter ? [
                'public_id' => $this->reporter->public_id,
                'display_name' => $this->reporter->display_name,
                'status' => $this->reporter->status,
            ] : null),
            'target_account_id' => $this->target?->public_id,
            'target_account' => $this->whenLoaded('target', fn () => $this->target ? [
                'public_id' => $this->target->public_id,
                'display_name' => $this->target->display_name,
                'status' => $this->target->status,
            ] : null),
            'assigned_admin_account_id' => $this->assignedAdmin?->public_id,
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
