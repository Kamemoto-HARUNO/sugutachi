<?php

namespace App\Http\Resources;

use App\Models\Campaign;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Campaign
 */
class CampaignResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'target_role' => $this->target_role,
            'target_label' => $this->targetLabel(),
            'trigger_type' => $this->trigger_type,
            'trigger_label' => $this->triggerLabel(),
            'benefit_type' => $this->benefit_type,
            'benefit_value' => $this->benefit_value,
            'benefit_summary' => $this->benefitSummary(),
            'offer_text' => $this->offer_text,
            'placements' => $this->publicPlacements(),
            'starts_at' => $this->starts_at,
            'ends_at' => $this->ends_at,
            'offer_valid_days' => $this->offer_valid_days,
        ];
    }
}
