<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TherapistPricingRuleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'therapist_menu_id' => $this->therapistMenu?->public_id,
            'therapist_menu' => $this->therapistMenu
                ? [
                    'public_id' => $this->therapistMenu->public_id,
                    'name' => $this->therapistMenu->name,
                ]
                : null,
            'rule_type' => $this->rule_type,
            'condition' => $this->condition_json,
            'adjustment_type' => $this->adjustment_type,
            'adjustment_amount' => $this->adjustment_amount,
            'min_price_amount' => $this->min_price_amount,
            'max_price_amount' => $this->max_price_amount,
            'priority' => $this->priority,
            'is_active' => $this->is_active,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
