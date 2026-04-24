<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AccountBlockResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'blocker_account_id' => $this->blocker?->public_id,
            'blocker_account' => $this->whenLoaded('blocker', fn () => $this->blocker ? [
                'public_id' => $this->blocker->public_id,
                'display_name' => $this->blocker->display_name,
                'status' => $this->blocker->status,
            ] : null),
            'blocked_account_id' => $this->blocked?->public_id,
            'blocked_account' => $this->whenLoaded('blocked', fn () => $this->blocked ? [
                'public_id' => $this->blocked->public_id,
                'display_name' => $this->blocked->display_name,
                'status' => $this->blocked->status,
            ] : null),
            'reason_code' => $this->reason_code,
            'created_at' => $this->created_at,
        ];
    }
}
