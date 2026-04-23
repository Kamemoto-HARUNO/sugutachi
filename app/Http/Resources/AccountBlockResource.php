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
            'blocked_account_id' => $this->blocked?->public_id,
            'reason_code' => $this->reason_code,
            'created_at' => $this->created_at,
        ];
    }
}
