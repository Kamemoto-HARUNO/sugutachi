<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AdminBookingStatusLogResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'to_status' => $this->to_status,
            'actor' => $this->whenLoaded('actor', fn () => $this->actor ? [
                'public_id' => $this->actor->public_id,
                'display_name' => $this->actor->display_name,
            ] : null),
            'actor_role' => $this->actor_role,
            'reason_code' => $this->reason_code,
            'metadata' => $this->metadata_json,
            'created_at' => $this->created_at,
        ];
    }
}
