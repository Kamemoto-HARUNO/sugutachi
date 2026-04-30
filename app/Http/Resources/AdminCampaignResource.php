<?php

namespace App\Http\Resources;

use App\Models\Campaign;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Campaign
 */
class AdminCampaignResource extends JsonResource
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
            'starts_at' => $this->starts_at,
            'ends_at' => $this->ends_at,
            'offer_valid_days' => $this->offer_valid_days,
            'is_enabled' => (bool) $this->is_enabled,
            'is_active' => $this->isActiveAt(),
            'applications_count' => (int) ($this->applications_count ?? 0),
            'can_delete' => (int) ($this->applications_count ?? 0) === 0,
            'total_applied_amount' => (int) ($this->total_applied_amount ?? 0),
            'created_by_account' => $this->whenLoaded('createdBy', fn () => $this->createdBy ? [
                'public_id' => $this->createdBy->public_id,
                'display_name' => $this->createdBy->display_name,
                'email' => $this->createdBy->email,
            ] : null),
            'updated_by_account' => $this->whenLoaded('updatedBy', fn () => $this->updatedBy ? [
                'public_id' => $this->updatedBy->public_id,
                'display_name' => $this->updatedBy->display_name,
                'email' => $this->updatedBy->email,
            ] : null),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
