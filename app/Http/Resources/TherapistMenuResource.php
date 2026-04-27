<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TherapistMenuResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'public_id' => $this->public_id,
            'name' => $this->name,
            'description' => $this->description,
            'duration_minutes' => $this->duration_minutes,
            'minimum_duration_minutes' => $this->minimum_duration_minutes,
            'duration_step_minutes' => $this->duration_step_minutes,
            'base_price_amount' => $this->base_price_amount,
            'hourly_rate_amount' => $this->hourly_rate_amount,
            'is_active' => $this->is_active,
            'sort_order' => $this->sort_order,
        ];
    }
}
