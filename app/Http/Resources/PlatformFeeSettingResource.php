<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PlatformFeeSettingResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'setting_key' => $this->setting_key,
            'value_json' => $this->value_json,
            'active_from' => $this->active_from,
            'active_until' => $this->active_until,
            'is_active' => $this->isActive(),
            'created_by_account' => $this->whenLoaded('createdBy', fn () => $this->createdBy ? [
                'public_id' => $this->createdBy->public_id,
                'display_name' => $this->createdBy->display_name,
                'email' => $this->createdBy->email,
            ] : null),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }

    private function isActive(): bool
    {
        if ($this->active_from && $this->active_from->isFuture()) {
            return false;
        }

        if ($this->active_until && $this->active_until->isPast()) {
            return false;
        }

        return true;
    }
}
