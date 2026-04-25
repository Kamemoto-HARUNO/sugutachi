<?php

namespace App\Http\Resources;

use App\Models\TherapistPricingRule;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AdminPricingRuleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        /** @var TherapistPricingRule $rule */
        $rule = $this->resource;

        return [
            'id' => $rule->id,
            'rule_type' => $rule->rule_type,
            'adjustment_bucket' => TherapistPricingRule::adjustmentBucketFor($rule->rule_type),
            'scope' => $rule->therapist_menu_id === null ? 'profile' : 'menu',
            'condition' => $rule->condition_json,
            'condition_summary' => $this->conditionSummary($rule),
            'adjustment_type' => $rule->adjustment_type,
            'adjustment_amount' => $rule->adjustment_amount,
            'min_price_amount' => $rule->min_price_amount,
            'max_price_amount' => $rule->max_price_amount,
            'priority' => $rule->priority,
            'is_active' => $rule->is_active,
            'monitoring_status' => $rule->monitoring_status,
            'monitoring_flags' => $rule->adminMonitoringFlags(),
            'has_monitoring_flags' => $rule->adminMonitoringFlags() !== [],
            'monitored_by_admin' => $this->whenLoaded('monitoredByAdmin', fn () => $rule->monitoredByAdmin ? [
                'public_id' => $rule->monitoredByAdmin->public_id,
                'display_name' => $rule->monitoredByAdmin->display_name,
            ] : null),
            'monitored_at' => $rule->monitored_at,
            'admin_note_count' => $this->when(isset($this->admin_notes_count), $this->admin_notes_count),
            'notes' => AdminNoteResource::collection($this->whenLoaded('adminNotes')),
            'therapist_profile' => $this->whenLoaded('therapistProfile', fn () => [
                'public_id' => $rule->therapistProfile?->public_id,
                'public_name' => $rule->therapistProfile?->public_name,
                'profile_status' => $rule->therapistProfile?->profile_status,
                'training_status' => $rule->therapistProfile?->training_status,
                'account' => $rule->therapistProfile?->relationLoaded('account') ? [
                    'public_id' => $rule->therapistProfile?->account?->public_id,
                    'display_name' => $rule->therapistProfile?->account?->display_name,
                    'email' => $rule->therapistProfile?->account?->email,
                    'status' => $rule->therapistProfile?->account?->status,
                ] : null,
            ]),
            'therapist_menu' => $this->whenLoaded('therapistMenu', fn () => $rule->therapistMenu ? [
                'public_id' => $rule->therapistMenu->public_id,
                'name' => $rule->therapistMenu->name,
                'duration_minutes' => $rule->therapistMenu->duration_minutes,
                'base_price_amount' => $rule->therapistMenu->base_price_amount,
                'is_active' => $rule->therapistMenu->is_active,
            ] : null),
            'created_at' => $rule->created_at,
            'updated_at' => $rule->updated_at,
        ];
    }

    private function conditionSummary(TherapistPricingRule $rule): ?string
    {
        $condition = $rule->condition_json ?? [];

        return match ($rule->rule_type) {
            TherapistPricingRule::RULE_TYPE_USER_PROFILE_ATTRIBUTE => $this->summaryForUserProfileCondition($condition),
            TherapistPricingRule::RULE_TYPE_TIME_BAND => isset($condition['start_hour'], $condition['end_hour'])
                ? sprintf('%02d:00-%02d:00', (int) $condition['start_hour'], (int) $condition['end_hour'])
                : null,
            TherapistPricingRule::RULE_TYPE_WALKING_TIME_RANGE,
            TherapistPricingRule::RULE_TYPE_DEMAND_LEVEL => $this->summaryForDiscreteCondition($condition),
            default => null,
        };
    }

    private function summaryForUserProfileCondition(array $condition): ?string
    {
        $field = $condition['field'] ?? null;
        $operator = $condition['operator'] ?? null;

        if (! is_string($field) || ! is_string($operator)) {
            return null;
        }

        $value = $condition['value'] ?? null;
        $values = $condition['values'] ?? null;

        if (is_array($values)) {
            return sprintf('%s %s %s', $field, $operator, implode(', ', $values));
        }

        if (is_string($value) || is_int($value)) {
            return sprintf('%s %s %s', $field, $operator, (string) $value);
        }

        return null;
    }

    private function summaryForDiscreteCondition(array $condition): ?string
    {
        $operator = $condition['operator'] ?? null;

        if (! is_string($operator)) {
            return null;
        }

        if (array_key_exists('value', $condition) && (is_string($condition['value']) || is_int($condition['value']))) {
            return sprintf('%s %s', $operator, (string) $condition['value']);
        }

        if (isset($condition['values']) && is_array($condition['values'])) {
            return sprintf('%s %s', $operator, implode(', ', $condition['values']));
        }

        return null;
    }
}
