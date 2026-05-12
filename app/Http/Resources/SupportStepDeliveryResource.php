<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SupportStepDeliveryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $targetSnapshot = $this->target_snapshot ?? [];

        return [
            'id' => $this->id,
            'scenario_public_id' => $this->whenLoaded('scenario', fn () => $this->scenario->public_id),
            'scenario_name' => $this->whenLoaded('scenario', fn () => $this->scenario->name),
            'account' => $this->whenLoaded('account', fn () => $this->account ? [
                'public_id' => $this->account->public_id,
                'display_name' => $this->account->display_name,
                'email' => $this->account->email,
                'status' => $this->account->status,
            ] : [
                'public_id' => $targetSnapshot['public_id'] ?? null,
                'display_name' => $targetSnapshot['display_name'] ?? null,
                'email' => $targetSnapshot['email'] ?? null,
                'status' => $targetSnapshot['status'] ?? null,
            ]),
            'requester_role' => $this->requester_role,
            'delivery_type' => $this->delivery_type,
            'status' => $this->status,
            'skip_reason' => $this->skip_reason,
            'error_message' => $this->error_message,
            'retry_count' => $this->retry_count,
            'scheduled_for_date' => $this->scheduled_for_date?->toDateString(),
            'attempted_at' => $this->attempted_at,
            'sent_at' => $this->sent_at,
            'support_ticket' => $this->whenLoaded('supportTicket', fn () => $this->supportTicket ? [
                'public_id' => $this->supportTicket->public_id,
                'title' => $this->supportTicket->title,
                'status' => $this->supportTicket->status,
            ] : null),
            'created_at' => $this->created_at,
        ];
    }
}
