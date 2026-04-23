<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AdminAuditLogResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'actor_account' => $this->whenLoaded('actor', fn () => $this->actor ? [
                'public_id' => $this->actor->public_id,
                'display_name' => $this->actor->display_name,
                'email' => $this->actor->email,
            ] : null),
            'action' => $this->action,
            'target_type' => $this->target_type,
            'target_id' => $this->target_id,
            'ip_hash' => $this->ip_hash,
            'user_agent_hash' => $this->user_agent_hash,
            'before' => $this->before_json,
            'after' => $this->after_json,
            'created_at' => $this->created_at,
        ];
    }
}
