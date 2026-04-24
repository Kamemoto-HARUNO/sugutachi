<?php

namespace App\Services\Pricing;

use App\Models\TherapistMenu;
use App\Models\TherapistPricingRule;
use App\Models\TherapistProfile;
use App\Models\UserProfile;
use Illuminate\Support\Collection;

class TherapistPricingRuleEvaluator
{
    public function evaluate(
        TherapistProfile $therapistProfile,
        TherapistMenu $menu,
        ?UserProfile $userProfile,
        int $baseAmount,
    ): array {
        if (! $userProfile) {
            return [
                'profile_adjustment_amount' => 0,
                'applied_rules' => [],
                'input_snapshot' => [],
            ];
        }

        $activeRules = $this->activeRules($therapistProfile, $menu);

        if ($activeRules->isEmpty()) {
            return [
                'profile_adjustment_amount' => 0,
                'applied_rules' => [],
                'input_snapshot' => [],
            ];
        }

        $subtotal = $baseAmount;
        $appliedRules = [];
        $inputSnapshot = [];

        foreach ($activeRules as $rule) {
            $condition = $rule->condition_json ?? [];
            $field = $condition['field'] ?? null;
            $actualValue = $this->normalizedActualValue($field, $userProfile);

            if (! is_string($field) || $actualValue === null) {
                continue;
            }

            $inputSnapshot[$field] = $actualValue;

            if (! $this->matches($rule, $actualValue)) {
                continue;
            }

            $rawAdjustmentAmount = $this->rawAdjustmentAmount($rule, $baseAmount);
            $nextSubtotal = $subtotal + $rawAdjustmentAmount;

            if ($rule->min_price_amount !== null) {
                $nextSubtotal = max($nextSubtotal, $rule->min_price_amount);
            }

            if ($rule->max_price_amount !== null) {
                $nextSubtotal = min($nextSubtotal, $rule->max_price_amount);
            }

            $nextSubtotal = max(0, $nextSubtotal);
            $appliedAdjustmentAmount = $nextSubtotal - $subtotal;
            $subtotal = $nextSubtotal;

            $appliedRules[] = [
                'rule_id' => $rule->id,
                'therapist_menu_id' => $rule->therapist_menu_id === null ? null : $menu->public_id,
                'rule_type' => $rule->rule_type,
                'condition' => $condition,
                'adjustment_type' => $rule->adjustment_type,
                'adjustment_amount' => $rule->adjustment_amount,
                'raw_adjustment_amount' => $rawAdjustmentAmount,
                'applied_adjustment_amount' => $appliedAdjustmentAmount,
                'min_price_amount' => $rule->min_price_amount,
                'max_price_amount' => $rule->max_price_amount,
                'priority' => $rule->priority,
            ];
        }

        return [
            'profile_adjustment_amount' => $subtotal - $baseAmount,
            'applied_rules' => $appliedRules,
            'input_snapshot' => $inputSnapshot,
        ];
    }

    private function activeRules(TherapistProfile $therapistProfile, TherapistMenu $menu): Collection
    {
        $rules = $therapistProfile->relationLoaded('pricingRules')
            ? $therapistProfile->pricingRules
            : $therapistProfile->pricingRules()->get();

        return $rules
            ->filter(fn (TherapistPricingRule $rule): bool => $rule->is_active
                && ($rule->therapist_menu_id === null || (int) $rule->therapist_menu_id === $menu->id))
            ->sort(function (TherapistPricingRule $left, TherapistPricingRule $right): int {
                return [
                    $left->priority,
                    $left->therapist_menu_id === null ? 1 : 0,
                    $left->id,
                ] <=> [
                    $right->priority,
                    $right->therapist_menu_id === null ? 1 : 0,
                    $right->id,
                ];
            })
            ->values();
    }

    private function matches(TherapistPricingRule $rule, int|string $actualValue): bool
    {
        $condition = $rule->condition_json ?? [];
        $operator = $condition['operator'] ?? null;

        if (! is_string($operator)) {
            return false;
        }

        return match ($operator) {
            TherapistPricingRule::OPERATOR_EQUALS => $actualValue === ($condition['value'] ?? null),
            TherapistPricingRule::OPERATOR_NOT_EQUALS => $actualValue !== ($condition['value'] ?? null),
            TherapistPricingRule::OPERATOR_IN => in_array($actualValue, $condition['values'] ?? [], true),
            TherapistPricingRule::OPERATOR_NOT_IN => ! in_array($actualValue, $condition['values'] ?? [], true),
            TherapistPricingRule::OPERATOR_GTE => is_int($actualValue) && $actualValue >= (int) ($condition['value'] ?? 0),
            TherapistPricingRule::OPERATOR_LTE => is_int($actualValue) && $actualValue <= (int) ($condition['value'] ?? 0),
            TherapistPricingRule::OPERATOR_BETWEEN => is_int($actualValue)
                && count($condition['values'] ?? []) === 2
                && $actualValue >= (int) $condition['values'][0]
                && $actualValue <= (int) $condition['values'][1],
            default => false,
        };
    }

    private function rawAdjustmentAmount(TherapistPricingRule $rule, int $baseAmount): int
    {
        return match ($rule->adjustment_type) {
            TherapistPricingRule::ADJUSTMENT_TYPE_PERCENTAGE => (int) round($baseAmount * ($rule->adjustment_amount / 100)),
            default => $rule->adjustment_amount,
        };
    }

    private function normalizedActualValue(?string $field, UserProfile $userProfile): int|string|null
    {
        if (! $field || ! in_array($field, TherapistPricingRule::supportedConditionFields(), true)) {
            return null;
        }

        $value = $userProfile->{$field};

        if ($value === null) {
            return null;
        }

        if (TherapistPricingRule::isNumericField($field)) {
            return (int) $value;
        }

        return (string) $value;
    }
}
