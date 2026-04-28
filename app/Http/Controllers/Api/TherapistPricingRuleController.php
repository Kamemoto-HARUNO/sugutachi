<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\TherapistPricingRuleResource;
use App\Models\TherapistPricingRule;
use App\Models\TherapistProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class TherapistPricingRuleController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $validated = $request->validate([
            'therapist_menu_id' => ['nullable', 'string', 'max:36'],
            'is_active' => ['nullable', 'boolean'],
            'rule_type' => ['nullable', Rule::in(TherapistPricingRule::supportedRuleTypes())],
        ]);

        $profile = $this->therapistProfile($request);
        $menuId = array_key_exists('therapist_menu_id', $validated)
            ? $this->resolveMenuId($profile, $validated['therapist_menu_id'])
            : null;

        $rules = $profile->pricingRules()
            ->with('therapistMenu')
            ->when($request->has('is_active'), fn ($query) => $query->where('is_active', $request->boolean('is_active')))
            ->when(isset($validated['rule_type']), fn ($query) => $query->where('rule_type', $validated['rule_type']))
            ->when(
                array_key_exists('therapist_menu_id', $validated),
                fn ($query) => $menuId === null
                    ? $query->whereNull('therapist_menu_id')
                    : $query->where('therapist_menu_id', $menuId)
            )
            ->orderBy('priority')
            ->orderByRaw('case when therapist_menu_id is null then 1 else 0 end')
            ->orderBy('id')
            ->get();

        return TherapistPricingRuleResource::collection($rules);
    }

    public function store(Request $request): JsonResponse
    {
        $profile = $this->therapistProfile($request);
        $payload = $this->validatedPayload($request, $profile);

        $rule = DB::transaction(fn (): TherapistPricingRule => $profile->pricingRules()->create($payload));

        return (new TherapistPricingRuleResource($rule->load('therapistMenu')))
            ->response()
            ->setStatusCode(201);
    }

    public function update(Request $request, TherapistPricingRule $therapistPricingRule): TherapistPricingRuleResource
    {
        $profile = $this->therapistProfile($request);
        abort_unless($therapistPricingRule->therapist_profile_id === $profile->id, 404);

        $payload = $this->validatedPayload($request, $profile, $therapistPricingRule, partial: true);

        $rule = DB::transaction(function () use ($therapistPricingRule, $payload): TherapistPricingRule {
            $therapistPricingRule->fill($payload);
            $therapistPricingRule->save();

            return $therapistPricingRule->refresh();
        });

        return new TherapistPricingRuleResource($rule->load('therapistMenu'));
    }

    public function destroy(Request $request, TherapistPricingRule $therapistPricingRule): Response
    {
        $profile = $this->therapistProfile($request);
        abort_unless($therapistPricingRule->therapist_profile_id === $profile->id, 404);

        $therapistPricingRule->delete();

        return response()->noContent();
    }

    private function therapistProfile(Request $request): TherapistProfile
    {
        return $request->user()->ensureTherapistProfile()->load('menus');
    }

    private function validatedPayload(
        Request $request,
        TherapistProfile $profile,
        ?TherapistPricingRule $currentRule = null,
        bool $partial = false,
    ): array {
        $validated = $request->validate([
            'therapist_menu_id' => ['sometimes', 'nullable', 'string', 'max:36'],
            'rule_type' => [$partial ? 'sometimes' : 'required', Rule::in(TherapistPricingRule::supportedRuleTypes())],
            'condition' => [$partial ? 'sometimes' : 'required', 'array'],
            'adjustment_type' => [$partial ? 'sometimes' : 'required', Rule::in([
                TherapistPricingRule::ADJUSTMENT_TYPE_FIXED_AMOUNT,
                TherapistPricingRule::ADJUSTMENT_TYPE_PERCENTAGE,
            ])],
            'adjustment_amount' => [$partial ? 'sometimes' : 'required', 'integer', 'between:-300000,300000'],
            'min_price_amount' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:300000'],
            'max_price_amount' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:300000'],
            'priority' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:1000'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $currentMenuPublicId = $currentRule?->therapist_menu_id
            ? $profile->menus->firstWhere('id', $currentRule->therapist_menu_id)?->public_id
            : null;

        $resolved = [
            'therapist_menu_id' => $this->resolveMenuId(
                $profile,
                array_key_exists('therapist_menu_id', $validated)
                    ? $validated['therapist_menu_id']
                    : $currentMenuPublicId
            ),
            'rule_type' => $validated['rule_type'] ?? $currentRule?->rule_type,
            'condition_json' => [],
            'adjustment_type' => $validated['adjustment_type'] ?? $currentRule?->adjustment_type,
            'adjustment_amount' => $validated['adjustment_amount'] ?? $currentRule?->adjustment_amount,
            'min_price_amount' => array_key_exists('min_price_amount', $validated)
                ? $validated['min_price_amount']
                : $currentRule?->min_price_amount,
            'max_price_amount' => array_key_exists('max_price_amount', $validated)
                ? $validated['max_price_amount']
                : $currentRule?->max_price_amount,
            'priority' => array_key_exists('priority', $validated)
                ? ($validated['priority'] ?? 100)
                : ($currentRule?->priority ?? 100),
            'is_active' => array_key_exists('is_active', $validated)
                ? (bool) $validated['is_active']
                : ($currentRule?->is_active ?? true),
        ];

        $resolved['condition_json'] = array_key_exists('condition', $validated)
            ? $this->resolveCondition(
                $resolved['rule_type'],
                $validated['condition']
            )
            : ($currentRule?->condition_json ?? []);

        if (
            $currentRule
            && array_key_exists('rule_type', $validated)
            && $validated['rule_type'] !== $currentRule->rule_type
            && ! array_key_exists('condition', $validated)
        ) {
            throw ValidationException::withMessages([
                'condition' => ['The condition is required when changing the rule type.'],
            ]);
        }

        if (! $resolved['rule_type']) {
            throw ValidationException::withMessages([
                'rule_type' => ['The rule type is required.'],
            ]);
        }

        if ($resolved['condition_json'] === []) {
            throw ValidationException::withMessages([
                'condition' => ['The condition is required.'],
            ]);
        }

        if (! $resolved['adjustment_type']) {
            throw ValidationException::withMessages([
                'adjustment_type' => ['The adjustment type is required.'],
            ]);
        }

        if ($resolved['adjustment_amount'] === null) {
            throw ValidationException::withMessages([
                'adjustment_amount' => ['The adjustment amount is required.'],
            ]);
        }

        if ($resolved['adjustment_type'] === TherapistPricingRule::ADJUSTMENT_TYPE_PERCENTAGE
            && ($resolved['adjustment_amount'] < -100 || $resolved['adjustment_amount'] > 300)) {
            throw ValidationException::withMessages([
                'adjustment_amount' => ['Percentage adjustments must be between -100 and 300.'],
            ]);
        }

        if ($resolved['min_price_amount'] !== null
            && $resolved['max_price_amount'] !== null
            && $resolved['min_price_amount'] > $resolved['max_price_amount']) {
            throw ValidationException::withMessages([
                'max_price_amount' => ['The maximum price must be greater than or equal to the minimum price.'],
            ]);
        }

        return $resolved;
    }

    private function resolveCondition(string $ruleType, mixed $condition): array
    {
        if (! is_array($condition)) {
            throw ValidationException::withMessages([
                'condition' => ['The condition must be an object.'],
            ]);
        }

        return match ($ruleType) {
            TherapistPricingRule::RULE_TYPE_USER_PROFILE_ATTRIBUTE => $this->resolveUserProfileCondition($condition),
            TherapistPricingRule::RULE_TYPE_TIME_BAND => $this->resolveTimeBandCondition($condition),
            TherapistPricingRule::RULE_TYPE_WALKING_TIME_RANGE => $this->resolveDiscreteCondition(
                condition: $condition,
                allowedValues: TherapistPricingRule::walkingTimeRanges(),
                attributePrefix: 'condition'
            ),
            TherapistPricingRule::RULE_TYPE_DEMAND_LEVEL => $this->resolveDiscreteCondition(
                condition: $condition,
                allowedValues: TherapistPricingRule::demandLevels(),
                attributePrefix: 'condition'
            ),
            default => throw ValidationException::withMessages([
                'rule_type' => ['The selected rule type is invalid.'],
            ]),
        };
    }

    private function resolveUserProfileCondition(array $condition): array
    {
        $field = $condition['field'] ?? null;
        $operator = $condition['operator'] ?? null;

        if (! is_string($field) || ! in_array($field, TherapistPricingRule::supportedConditionFields(), true)) {
            throw ValidationException::withMessages([
                'condition.field' => ['The selected field is invalid.'],
            ]);
        }

        if (! is_string($operator) || ! in_array($operator, TherapistPricingRule::supportedOperatorsFor($field), true)) {
            throw ValidationException::withMessages([
                'condition.operator' => ['The selected operator is invalid for that field.'],
            ]);
        }

        if (in_array($operator, [
            TherapistPricingRule::OPERATOR_EQUALS,
            TherapistPricingRule::OPERATOR_NOT_EQUALS,
            TherapistPricingRule::OPERATOR_GTE,
            TherapistPricingRule::OPERATOR_LTE,
        ], true)) {
            return [
                'field' => $field,
                'operator' => $operator,
                'value' => $this->normalizeConditionValue(
                    $field,
                    $condition['value'] ?? null,
                    'condition.value'
                ),
            ];
        }

        $values = $condition['values'] ?? null;

        if (! is_array($values) || $values === []) {
            throw ValidationException::withMessages([
                'condition.values' => ['The condition values are required.'],
            ]);
        }

        $normalizedValues = collect($values)
            ->map(fn ($value) => $this->normalizeConditionValue($field, $value, 'condition.values'))
            ->values()
            ->all();

        if ($operator === TherapistPricingRule::OPERATOR_BETWEEN) {
            if (! TherapistPricingRule::isNumericField($field) || count($normalizedValues) !== 2) {
                throw ValidationException::withMessages([
                    'condition.values' => ['Between conditions require exactly two numeric values.'],
                ]);
            }

            sort($normalizedValues);
        }

        return [
            'field' => $field,
            'operator' => $operator,
            'values' => array_values(array_unique($normalizedValues, SORT_REGULAR)),
        ];
    }

    private function resolveTimeBandCondition(array $condition): array
    {
        $startHour = $condition['start_hour'] ?? null;
        $endHour = $condition['end_hour'] ?? null;

        if (! is_int($startHour) && ! (is_string($startHour) && preg_match('/^\d+$/', $startHour) === 1)) {
            throw ValidationException::withMessages([
                'condition.start_hour' => ['The start hour must be an integer.'],
            ]);
        }

        if (! is_int($endHour) && ! (is_string($endHour) && preg_match('/^\d+$/', $endHour) === 1)) {
            throw ValidationException::withMessages([
                'condition.end_hour' => ['The end hour must be an integer.'],
            ]);
        }

        $startHour = (int) $startHour;
        $endHour = (int) $endHour;

        if ($startHour < 0 || $startHour > 23) {
            throw ValidationException::withMessages([
                'condition.start_hour' => ['The start hour must be between 0 and 23.'],
            ]);
        }

        if ($endHour < 0 || $endHour > 23) {
            throw ValidationException::withMessages([
                'condition.end_hour' => ['The end hour must be between 0 and 23.'],
            ]);
        }

        if ($startHour === $endHour) {
            throw ValidationException::withMessages([
                'condition.end_hour' => ['The end hour must differ from the start hour.'],
            ]);
        }

        return [
            'start_hour' => $startHour,
            'end_hour' => $endHour,
        ];
    }

    /**
     * @param  array<int, string>  $allowedValues
     */
    private function resolveDiscreteCondition(
        array $condition,
        array $allowedValues,
        string $attributePrefix,
    ): array {
        $operator = $condition['operator'] ?? null;

        if (! is_string($operator) || ! in_array($operator, [
            TherapistPricingRule::OPERATOR_EQUALS,
            TherapistPricingRule::OPERATOR_NOT_EQUALS,
            TherapistPricingRule::OPERATOR_IN,
            TherapistPricingRule::OPERATOR_NOT_IN,
        ], true)) {
            throw ValidationException::withMessages([
                "{$attributePrefix}.operator" => ['The selected operator is invalid.'],
            ]);
        }

        if (in_array($operator, [
            TherapistPricingRule::OPERATOR_EQUALS,
            TherapistPricingRule::OPERATOR_NOT_EQUALS,
        ], true)) {
            $value = $condition['value'] ?? null;

            if (! is_string($value) || ! in_array($value, $allowedValues, true)) {
                throw ValidationException::withMessages([
                    "{$attributePrefix}.value" => ['The selected value is invalid.'],
                ]);
            }

            return [
                'operator' => $operator,
                'value' => $value,
            ];
        }

        $values = $condition['values'] ?? null;

        if (! is_array($values) || $values === []) {
            throw ValidationException::withMessages([
                "{$attributePrefix}.values" => ['The condition values are required.'],
            ]);
        }

        foreach ($values as $value) {
            if (! is_string($value) || ! in_array($value, $allowedValues, true)) {
                throw ValidationException::withMessages([
                    "{$attributePrefix}.values" => ['The selected values are invalid.'],
                ]);
            }
        }

        return [
            'operator' => $operator,
            'values' => array_values(array_unique($values)),
        ];
    }

    private function normalizeConditionValue(string $field, mixed $value, string $attribute): int|string
    {
        if (TherapistPricingRule::isNumericField($field)) {
            if (! is_int($value) && ! (is_string($value) && preg_match('/^-?\d+$/', $value) === 1)) {
                throw ValidationException::withMessages([
                    $attribute => ['The value must be an integer.'],
                ]);
            }

            return (int) $value;
        }

        if (! is_string($value)) {
            throw ValidationException::withMessages([
                $attribute => ['The value must be a string.'],
            ]);
        }

        $allowedValues = TherapistPricingRule::categoricalValuesFor($field);

        if ($allowedValues !== null && ! in_array($value, $allowedValues, true)) {
            throw ValidationException::withMessages([
                $attribute => ['The selected value is invalid for that field.'],
            ]);
        }

        return $value;
    }

    private function resolveMenuId(TherapistProfile $profile, mixed $menuPublicId): ?int
    {
        if (! filled($menuPublicId)) {
            return null;
        }

        $menuId = $profile->menus->firstWhere('public_id', $menuPublicId)?->id;

        if (! $menuId) {
            throw ValidationException::withMessages([
                'therapist_menu_id' => ['The selected therapist menu is invalid.'],
            ]);
        }

        return $menuId;
    }
}
