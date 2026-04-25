<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

#[Guarded(['id'])]
class TherapistPricingRule extends Model
{
    public const RULE_TYPE_USER_PROFILE_ATTRIBUTE = 'user_profile_attribute';

    public const RULE_TYPE_TIME_BAND = 'time_band';

    public const RULE_TYPE_WALKING_TIME_RANGE = 'walking_time_range';

    public const RULE_TYPE_DEMAND_LEVEL = 'demand_level';

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

    public const WALKING_TIME_RANGE_WITHIN_15 = 'within_15_min';

    public const WALKING_TIME_RANGE_WITHIN_30 = 'within_30_min';

    public const WALKING_TIME_RANGE_WITHIN_60 = 'within_60_min';

    public const WALKING_TIME_RANGE_OUTSIDE = 'outside_area';

    public const DEMAND_LEVEL_NORMAL = 'normal';

    public const DEMAND_LEVEL_BUSY = 'busy';

    public const DEMAND_LEVEL_PEAK = 'peak';

    public const MONITORING_FLAG_INACTIVE_MENU = 'inactive_menu';

    public const MONITORING_FLAG_EXTREME_PERCENTAGE = 'extreme_percentage';

    public const MONITORING_FLAG_MENU_PRICE_OVERRIDE = 'menu_price_override';

    public const MONITORING_STATUS_UNREVIEWED = 'unreviewed';

    public const MONITORING_STATUS_UNDER_REVIEW = 'under_review';

    public const MONITORING_STATUS_REVIEWED = 'reviewed';

    public const MONITORING_STATUS_ESCALATED = 'escalated';

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

    public function monitoredByAdmin(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'monitored_by_admin_account_id');
    }

    public function adminNotes(): MorphMany
    {
        return $this->morphMany(AdminNote::class, 'target')->oldest('created_at');
    }

    public function scopeWithMonitoringFlag(Builder $query, string $flag): Builder
    {
        return match ($flag) {
            self::MONITORING_FLAG_INACTIVE_MENU => $query
                ->where('is_active', true)
                ->whereNotNull('therapist_menu_id')
                ->whereHas('therapistMenu', fn (Builder $menu) => $menu->where('is_active', false)),
            self::MONITORING_FLAG_EXTREME_PERCENTAGE => $query
                ->where('is_active', true)
                ->where('adjustment_type', self::ADJUSTMENT_TYPE_PERCENTAGE)
                ->where(function (Builder $query): void {
                    $query
                        ->where('adjustment_amount', '>=', 100)
                        ->orWhere('adjustment_amount', '<=', -100);
                }),
            self::MONITORING_FLAG_MENU_PRICE_OVERRIDE => $query
                ->where('is_active', true)
                ->where('adjustment_type', self::ADJUSTMENT_TYPE_FIXED_AMOUNT)
                ->whereNotNull('therapist_menu_id')
                ->whereHas('therapistMenu', fn (Builder $menu) => $menu
                    ->whereRaw('ABS(therapist_pricing_rules.adjustment_amount) >= therapist_menus.base_price_amount')),
            default => $query->whereRaw('1 = 0'),
        };
    }

    public function scopeNeedsMonitoring(Builder $query): Builder
    {
        return $query->where(function (Builder $query): void {
            foreach (self::supportedMonitoringFlags() as $index => $flag) {
                if ($index === 0) {
                    $query->withMonitoringFlag($flag);

                    continue;
                }

                $query->orWhere(fn (Builder $nested) => $nested->withMonitoringFlag($flag));
            }
        });
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
            'monitored_at' => 'datetime',
        ];
    }

    public static function supportedConditionFields(): array
    {
        return array_keys(self::FIELD_OPERATORS);
    }

    public static function supportedRuleTypes(): array
    {
        return [
            self::RULE_TYPE_USER_PROFILE_ATTRIBUTE,
            self::RULE_TYPE_TIME_BAND,
            self::RULE_TYPE_WALKING_TIME_RANGE,
            self::RULE_TYPE_DEMAND_LEVEL,
        ];
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

    public static function walkingTimeRanges(): array
    {
        return [
            self::WALKING_TIME_RANGE_WITHIN_15,
            self::WALKING_TIME_RANGE_WITHIN_30,
            self::WALKING_TIME_RANGE_WITHIN_60,
            self::WALKING_TIME_RANGE_OUTSIDE,
        ];
    }

    public static function demandLevels(): array
    {
        return [
            self::DEMAND_LEVEL_NORMAL,
            self::DEMAND_LEVEL_BUSY,
            self::DEMAND_LEVEL_PEAK,
        ];
    }

    public static function supportedMonitoringFlags(): array
    {
        return [
            self::MONITORING_FLAG_INACTIVE_MENU,
            self::MONITORING_FLAG_EXTREME_PERCENTAGE,
            self::MONITORING_FLAG_MENU_PRICE_OVERRIDE,
        ];
    }

    public static function supportedMonitoringStatuses(): array
    {
        return [
            self::MONITORING_STATUS_UNREVIEWED,
            self::MONITORING_STATUS_UNDER_REVIEW,
            self::MONITORING_STATUS_REVIEWED,
            self::MONITORING_STATUS_ESCALATED,
        ];
    }

    public static function adjustmentBucketFor(string $ruleType): string
    {
        return $ruleType === self::RULE_TYPE_USER_PROFILE_ATTRIBUTE
            ? 'profile_adjustment'
            : 'demand_fee';
    }

    public function adminMonitoringFlags(): array
    {
        $flags = [];

        if ($this->isActiveOnInactiveMenu()) {
            $flags[] = self::MONITORING_FLAG_INACTIVE_MENU;
        }

        if ($this->isExtremePercentageAdjustment()) {
            $flags[] = self::MONITORING_FLAG_EXTREME_PERCENTAGE;
        }

        if ($this->isMenuPriceOverride()) {
            $flags[] = self::MONITORING_FLAG_MENU_PRICE_OVERRIDE;
        }

        return array_values(array_unique($flags));
    }

    private function isActiveOnInactiveMenu(): bool
    {
        return $this->is_active
            && $this->therapist_menu_id !== null
            && $this->therapistMenu !== null
            && ! $this->therapistMenu->is_active;
    }

    private function isExtremePercentageAdjustment(): bool
    {
        return $this->is_active
            && $this->adjustment_type === self::ADJUSTMENT_TYPE_PERCENTAGE
            && ($this->adjustment_amount >= 100 || $this->adjustment_amount <= -100);
    }

    private function isMenuPriceOverride(): bool
    {
        return $this->is_active
            && $this->adjustment_type === self::ADJUSTMENT_TYPE_FIXED_AMOUNT
            && $this->therapist_menu_id !== null
            && $this->therapistMenu !== null
            && abs($this->adjustment_amount) >= $this->therapistMenu->base_price_amount;
    }
}
