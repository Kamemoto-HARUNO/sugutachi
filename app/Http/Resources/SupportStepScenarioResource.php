<?php

namespace App\Http\Resources;

use App\Models\SupportStepDelivery;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SupportStepScenarioResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $sentCount = $this->sent_count ?? null;
        $todaySentCount = $this->today_sent_count ?? null;
        $last7DaysSentCount = $this->last_7_days_sent_count ?? null;
        $last30DaysSentCount = $this->last_30_days_sent_count ?? null;

        return [
            'public_id' => $this->public_id,
            'name' => $this->name,
            'status' => $this->status,
            'target_role' => $this->target_role,
            'identity_verification_status' => $this->identity_verification_status,
            'elapsed_days' => $this->elapsed_days,
            'send_time' => substr((string) $this->send_time, 0, 5),
            'priority' => $this->priority,
            'ticket_title' => $this->ticket_title,
            'ticket_category' => $this->ticket_category,
            'message_body' => $this->message_body,
            'internal_notes' => $this->internal_notes,
            'can_delete' => (bool) ($this->can_delete ?? false),
            'archived_at' => $this->archived_at,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            'created_by' => $this->whenLoaded('createdBy', fn () => $this->createdBy ? [
                'public_id' => $this->createdBy->public_id,
                'display_name' => $this->createdBy->display_name,
                'email' => $this->createdBy->email,
            ] : null),
            'summary' => [
                'sent_total' => (int) ($sentCount ?? $this->deliveries()
                    ->where('status', SupportStepDelivery::STATUS_SENT)
                    ->where('delivery_type', '!=', SupportStepDelivery::TYPE_TEST)
                    ->count()),
                'sent_today' => (int) ($todaySentCount ?? 0),
                'sent_last_7_days' => (int) ($last7DaysSentCount ?? 0),
                'sent_last_30_days' => (int) ($last30DaysSentCount ?? 0),
            ],
        ];
    }
}
