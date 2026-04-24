<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Guarded(['id'])]
class TherapistPricingRule extends Model
{
    public const RULE_TYPE_USER_PROFILE_ATTRIBUTE = 'user_profile_attribute';

    public const ADJUSTMENT_TYPE_FIXED_AMOUNT = 'fixed_amount';

    public const ADJUSTMENT_TYPE_PERCENTAGE = 'percentage';

    public const OPERATOR_EQUALS = 'equals';

    public const OPERATOR_NOT_EQUALS = 'not_equals';

    public const OPERATOR_IN = 'in';

    public const OPERATOR_NOT_IN = 'not_in';

    public const OPERATOR_GTE = 'gte';

    public const OPERATOR_LTE = 'lte';

    public const OPERATOR_BETWEEN = 'between';

    public const FIELD_AGE_RANGE = 'age_range';

    public const FIELD_BODY_TYPE = 'body_type';

    public const FIELD_HEIGHT_CM = 'height_cm';

    public const FIELD_WEIGHT_RANGE = 'weight_range';

    public const FIELD_SEXUAL_ORIENTATION = 'sexual_orientation';

    public const FIELD_GENDER_IDENTITY = 'gender_identity';

    private const FIELD_VALUE_OPTIONS = [
        self::FIELD_AGE_RANGE => ['18_24', '20s', '30s', '40s', '50s', '60_plus'],
        self::FIELD_BODY_TYPE => ['slim', 'average', 'muscular', 'chubby', 'large', 'other'],
        self::FIELD_WEIGHT_RANGE => ['40_49', '50_59', '60_69', '70_79', '80_89', '90_plus'],
        self::FIELD_SEXUAL_ORIENTATION => ['gay', 'bi', 'straight', 'other', 'no_answer'],
        self::FIELD_GENDER_IDENTITY => ['cis_male', 'trans_male', 'other', 'no_answer'],
    ];

    private const FIELD_OPERATORS = [
        self::FIELD_AGE_RANGE => [
            self::OPERATOR_EQUALS,
            self::OPERATOR_NOT_EQUALS,
            self::OPERATOR_IN,
            self::OPERATOR_NOT_IN,
        ],
        self::FIELD_BODY_TYPE => [
            self::OPERATOR_EQUALS,
            self::OPERATOR_NOT_EQUALS,
            self::OPERATOR_IN,
            self::OPERATOR_NOT_IN,
        ],
        self::FIELD_HEIGHT_CM => [
            self::OPERATOR_EQUALS,
            self::OPERATOR_NOT_EQUALS,
            self::OPERATOR_GTE,
            self::OPERATOR_LTE,
            self::OPERATOR_BETWEEN,
        ],
        self::FIELD_WEIGHT_RANGE => [
            self::OPERATOR_EQUALS,
            self::OPERATOR_NOT_EQUALS,
            self::OPERATOR_IN,
            self::OPERATOR_NOT_IN,
        ],
        self::FIELD_SEXUAL_ORIENTATION => [
            self::OPERATOR_EQUALS,
            self::OPERATOR_NOT_EQUALS,
            self::OPERATOR_IN,
            self::OPERATOR_NOT_IN,
        ],
        self::FIELD_GENDER_IDENTITY => [
            self::OPERATOR_EQUALS,
            self::OPERATOR_NOT_EQUALS,
            self::OPERATOR_IN,
            self::OPERATOR_NOT_IN,
        ],
    ];

    public function therapistProfile(): BelongsTo
    {
        return $this->belongsTo(TherapistProfile::class);
    }

    public function therapistMenu(): BelongsTo
    {
        return $this->belongsTo(TherapistMenu::class);
    }

    protected function casts(): array
    {
        return [
            'condition_json' => 'array',
            'adjustment_amount' => 'integer',
            'min_price_amount' => 'integer',
            'max_price_amount' => 'integer',
            'priority' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public static function supportedConditionFields(): array
    {
        return array_keys(self::FIELD_OPERATORS);
    }

    public static function supportedOperatorsFor(string $field): array
    {
        return self::FIELD_OPERATORS[$field] ?? [];
    }

    public static function categoricalValuesFor(string $field): ?array
    {
        return self::FIELD_VALUE_OPTIONS[$field] ?? null;
    }

    public static function isNumericField(string $field): bool
    {
        return $field === self::FIELD_HEIGHT_CM;
    }
}
