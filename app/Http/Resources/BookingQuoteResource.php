<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BookingQuoteResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'quote_id' => $this->public_id,
            'expires_at' => $this->expires_at,
            'is_on_demand' => $this->input_snapshot_json['is_on_demand'] ?? true,
            'requested_start_at' => $this->input_snapshot_json['requested_start_at'] ?? null,
            'availability_slot_id' => $this->input_snapshot_json['availability_slot_id'] ?? null,
            'amounts' => [
                'base_amount' => $this->base_amount,
                'travel_fee_amount' => $this->travel_fee_amount,
                'night_fee_amount' => $this->night_fee_amount,
                'demand_fee_amount' => $this->demand_fee_amount,
                'profile_adjustment_amount' => $this->profile_adjustment_amount,
                'discount_amount' => $this->discount_amount,
                'matching_fee_amount' => $this->matching_fee_amount,
                'platform_fee_amount' => $this->platform_fee_amount,
                'total_amount' => $this->total_amount,
                'therapist_gross_amount' => $this->therapist_gross_amount,
                'therapist_net_amount' => $this->therapist_net_amount,
            ],
            'discount' => $this->discount_snapshot_json
                ? [
                    ...$this->discount_snapshot_json,
                    'discount_amount' => $this->discount_amount,
                ]
                : null,
            'travel_mode' => $this->input_snapshot_json['travel_mode'] ?? null,
            'walking_time_range' => $this->input_snapshot_json['walking_time_range'] ?? null,
            'pricing_context' => [
                'requested_hour' => data_get($this->input_snapshot_json, 'pricing_rule_context.requested_hour'),
                'walking_time_range' => data_get($this->input_snapshot_json, 'pricing_rule_context.walking_time_range'),
                'demand_level' => data_get($this->input_snapshot_json, 'pricing_rule_context.demand_level'),
            ],
            'applied_rules' => collect(data_get($this->applied_rules_json, 'pricing_rules', []))
                ->filter(fn ($rule) => is_array($rule))
                ->map(fn (array $rule) => [
                    'rule_type' => is_string($rule['rule_type'] ?? null) ? $rule['rule_type'] : null,
                    'bucket' => is_string($rule['bucket'] ?? null) ? $rule['bucket'] : null,
                    'condition' => is_array($rule['condition'] ?? null) ? $rule['condition'] : [],
                    'adjustment_type' => is_string($rule['adjustment_type'] ?? null) ? $rule['adjustment_type'] : null,
                    'adjustment_amount' => (int) ($rule['adjustment_amount'] ?? 0),
                    'raw_adjustment_amount' => (int) ($rule['raw_adjustment_amount'] ?? 0),
                    'applied_adjustment_amount' => (int) ($rule['applied_adjustment_amount'] ?? 0),
                    'min_price_amount' => array_key_exists('min_price_amount', $rule) && $rule['min_price_amount'] !== null
                        ? (int) $rule['min_price_amount']
                        : null,
                    'max_price_amount' => array_key_exists('max_price_amount', $rule) && $rule['max_price_amount'] !== null
                        ? (int) $rule['max_price_amount']
                        : null,
                    'priority' => array_key_exists('priority', $rule) && $rule['priority'] !== null
                        ? (int) $rule['priority']
                        : null,
                ])
                ->values()
                ->all(),
        ];
    }
}
