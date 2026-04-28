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
        array $context = [],
    ): array {
        $activeRules = $this->activeRules($therapistProfile, $menu);

        if ($activeRules->isEmpty()) {
            return [
                'profile_adjustment_amount' => 0,
                'demand_fee_amount' => 0,
                'applied_rules' => [],
                'input_snapshot' => [
                    'user_profile_attributes' => [],
                    'pricing_context' => [],
                ],
            ];
        }

        $subtotal = $baseAmount;
        $profileAdjustmentAmount = 0;
        $demandFeeAmount = 0;
        $appliedRules = [];
        $profileInputSnapshot = [];
        $contextInputSnapshot = [];

        foreach ($activeRules as $rule) {
            $condition = $rule->condition_json ?? [];
            $matchResult = $this->matchResult($rule, $userProfile, $context);

            if (! $matchResult['matched']) {
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
            $bucket = $this->bucketForRuleType($rule->rule_type);

            if ($bucket === 'profile_adjustment') {
                $profileAdjustmentAmount += $appliedAdjustmentAmount;
            } else {
                $demandFeeAmount += $appliedAdjustmentAmount;
            }

            if ($matchResult['snapshot_key'] !== null) {
                if ($bucket === 'profile_adjustment') {
                    $profileInputSnapshot[$matchResult['snapshot_key']] = $matchResult['actual_value'];
                } else {
                    $contextInputSnapshot[$matchResult['snapshot_key']] = $matchResult['actual_value'];
                }
            }

            $appliedRules[] = [
                'rule_id' => $rule->id,
                'therapist_menu_id' => $rule->therapist_menu_id === null ? null : $menu->public_id,
                'rule_type' => $rule->rule_type,
                'bucket' => $bucket,
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
            'profile_adjustment_amount' => $profileAdjustmentAmount,
            'demand_fee_amount' => $demandFeeAmount,
            'applied_rules' => $appliedRules,
            'input_snapshot' => [
                'user_profile_attributes' => $profileInputSnapshot,
                'pricing_context' => $contextInputSnapshot,
            ],
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

    private function matchResult(
        TherapistPricingRule $rule,
        ?UserProfile $userProfile,
        array $context,
    ): array {
        return match ($rule->rule_type) {
            TherapistPricingRule::RULE_TYPE_USER_PROFILE_ATTRIBUTE => $this->matchUserProfileRule($rule, $userProfile),
            TherapistPricingRule::RULE_TYPE_TIME_BAND => $this->matchTimeBandRule($rule, $context),
            TherapistPricingRule::RULE_TYPE_WALKING_TIME_RANGE => $this->matchDiscreteContextRule(
                rule: $rule,
                contextKey: 'walking_time_range',
                context: $context
            ),
            TherapistPricingRule::RULE_TYPE_DEMAND_LEVEL => $this->matchDiscreteContextRule(
                rule: $rule,
                contextKey: 'demand_level',
                context: $context
            ),
            default => [
                'matched' => false,
                'actual_value' => null,
                'snapshot_key' => null,
            ],
        };
    }

    private function matchUserProfileRule(TherapistPricingRule $rule, ?UserProfile $userProfile): array
    {
        $condition = $rule->condition_json ?? [];
        $field = $condition['field'] ?? null;
        $actualValue = $userProfile ? $this->normalizedActualValue($field, $userProfile) : null;

        if (! is_string($field) || $actualValue === null) {
            return [
                'matched' => false,
                'actual_value' => null,
                'snapshot_key' => null,
            ];
        }

        return [
            'matched' => $this->matches($rule, $actualValue),
            'actual_value' => $actualValue,
            'snapshot_key' => $field,
        ];
    }

    private function matchTimeBandRule(TherapistPricingRule $rule, array $context): array
    {
        $condition = $rule->condition_json ?? [];
        $requestedHour = $context['requested_hour'] ?? null;

        if (! is_int($requestedHour)) {
            return [
                'matched' => false,
                'actual_value' => null,
                'snapshot_key' => null,
            ];
        }

        $startHour = (int) ($condition['start_hour'] ?? -1);
        $endHour = (int) ($condition['end_hour'] ?? -1);
        $matched = $startHour < $endHour
            ? ($requestedHour >= $startHour && $requestedHour < $endHour)
            : ($requestedHour >= $startHour || $requestedHour < $endHour);

        return [
            'matched' => $matched,
            'actual_value' => $requestedHour,
            'snapshot_key' => 'requested_hour',
        ];
    }

    private function matchDiscreteContextRule(
        TherapistPricingRule $rule,
        string $contextKey,
        array $context,
    ): array {
        $actualValue = $context[$contextKey] ?? null;

        if (! is_string($actualValue)) {
            return [
                'matched' => false,
                'actual_value' => null,
                'snapshot_key' => null,
            ];
        }

        if ($contextKey === 'walking_time_range') {
            return [
                'matched' => $this->matchesWalkingTimeRange($rule, $actualValue),
                'actual_value' => $actualValue,
                'snapshot_key' => $contextKey,
            ];
        }

        return [
            'matched' => $this->matches($rule, $actualValue),
            'actual_value' => $actualValue,
            'snapshot_key' => $contextKey,
        ];
    }

    private function matchesWalkingTimeRange(TherapistPricingRule $rule, string $actualValue): bool
    {
        $condition = $rule->condition_json ?? [];
        $operator = $condition['operator'] ?? null;

        if (! is_string($operator)) {
            return false;
        }

        $evaluate = function (string $expectedValue) use ($actualValue): bool {
            if ($expectedValue === TherapistPricingRule::WALKING_TIME_RANGE_OUTSIDE) {
                return $actualValue === TherapistPricingRule::WALKING_TIME_RANGE_OUTSIDE;
            }

            if ($actualValue === TherapistPricingRule::WALKING_TIME_RANGE_OUTSIDE) {
                return false;
            }

            $expectedMinutes = $this->walkingTimeRangeMinutes($expectedValue);
            $actualMinutes = $this->walkingTimeRangeMinutes($actualValue);

            if ($expectedMinutes === null || $actualMinutes === null) {
                return false;
            }

            return $actualMinutes <= $expectedMinutes;
        };

        return match ($operator) {
            TherapistPricingRule::OPERATOR_EQUALS => is_string($condition['value'] ?? null) && $evaluate($condition['value']),
            TherapistPricingRule::OPERATOR_NOT_EQUALS => is_string($condition['value'] ?? null) && ! $evaluate($condition['value']),
            TherapistPricingRule::OPERATOR_IN => collect($condition['values'] ?? [])->filter(fn ($value) => is_string($value))->contains(fn ($value) => $evaluate($value)),
            TherapistPricingRule::OPERATOR_NOT_IN => ! collect($condition['values'] ?? [])->filter(fn ($value) => is_string($value))->contains(fn ($value) => $evaluate($value)),
            default => false,
        };
    }

    private function walkingTimeRangeMinutes(string $value): ?int
    {
        if (preg_match('/^within_(\d+)_min$/', $value, $matches) !== 1) {
            return null;
        }

        return (int) $matches[1];
    }

    private function rawAdjustmentAmount(TherapistPricingRule $rule, int $baseAmount): int
    {
        return match ($rule->adjustment_type) {
            TherapistPricingRule::ADJUSTMENT_TYPE_PERCENTAGE => (int) round($baseAmount * ($rule->adjustment_amount / 100)),
            default => $rule->adjustment_amount,
        };
    }

    private function bucketForRuleType(string $ruleType): string
    {
        return $ruleType === TherapistPricingRule::RULE_TYPE_USER_PROFILE_ATTRIBUTE
            ? 'profile_adjustment'
            : 'demand_fee';
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
