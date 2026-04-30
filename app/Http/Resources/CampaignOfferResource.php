<?php

namespace App\Http\Resources;

use App\Models\CampaignApplication;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin CampaignApplication
 */
class CampaignOfferResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $campaign = $this->campaign;

        return [
            'id' => $this->id,
            'campaign_id' => $this->campaign_id,
            'status' => $this->status,
            'status_label' => $this->statusLabel(),
            'benefit_type' => $this->benefit_type,
            'benefit_value' => $this->benefit_value,
            'benefit_summary' => $campaign?->benefitSummary(),
            'offer_text' => $campaign?->offer_text,
            'trigger_type' => $campaign?->trigger_type,
            'trigger_label' => $campaign?->triggerLabel(),
            'offer_valid_days' => $campaign?->offer_valid_days,
            'offer_expires_at' => $this->offer_expires_at,
            'applied_amount' => (int) $this->applied_amount,
            'applied_at' => $this->applied_at,
            'consumed_at' => $this->consumed_at,
            'booking_public_id' => $this->booking?->public_id,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }

    private function statusLabel(): string
    {
        return match ($this->status) {
            CampaignApplication::STATUS_AVAILABLE => '保有中',
            CampaignApplication::STATUS_RESERVED => '予約確保中',
            CampaignApplication::STATUS_CONSUMED => '利用済み',
            CampaignApplication::STATUS_EXPIRED => '期限切れ',
            default => $this->status,
        };
    }
}
