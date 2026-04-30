<?php

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Guarded(['id'])]
class Campaign extends Model
{
    public const TARGET_THERAPIST = 'therapist';

    public const TARGET_USER = 'user';

    public const TRIGGER_THERAPIST_REGISTRATION = 'therapist_registration';

    public const TRIGGER_THERAPIST_BOOKING = 'therapist_booking';

    public const TRIGGER_USER_FIRST_BOOKING = 'user_first_booking';

    public const TRIGGER_USER_BOOKING = 'user_booking';

    public const BENEFIT_TYPE_FIXED_AMOUNT = 'fixed_amount';

    public const BENEFIT_TYPE_PERCENTAGE = 'percentage';

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'created_by_account_id');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'updated_by_account_id');
    }

    public function applications(): HasMany
    {
        return $this->hasMany(CampaignApplication::class);
    }

    public function scopeActiveAt($query, CarbonInterface $at)
    {
        return $query
            ->where('starts_at', '<=', $at)
            ->where(function ($builder) use ($at): void {
                $builder
                    ->whereNull('ends_at')
                    ->orWhere('ends_at', '>=', $at);
            });
    }

    public function isActiveAt(?CarbonInterface $at = null): bool
    {
        $at ??= now();

        if (! $this->is_enabled) {
            return false;
        }

        if ($this->starts_at?->isAfter($at)) {
            return false;
        }

        if ($this->ends_at?->isBefore($at)) {
            return false;
        }

        return true;
    }

    public function publicPlacements(): array
    {
        return match ($this->trigger_type) {
            self::TRIGGER_THERAPIST_REGISTRATION => ['register'],
            self::TRIGGER_THERAPIST_BOOKING => ['therapist_dashboard'],
            self::TRIGGER_USER_FIRST_BOOKING => ['register'],
            self::TRIGGER_USER_BOOKING => ['therapist_detail'],
            default => [],
        };
    }

    public function isUserFirstBookingOffer(): bool
    {
        return $this->target_role === self::TARGET_USER
            && $this->trigger_type === self::TRIGGER_USER_FIRST_BOOKING;
    }

    public function targetLabel(): string
    {
        return $this->target_role === self::TARGET_THERAPIST ? 'タチキャスト' : '利用者';
    }

    public function triggerLabel(): string
    {
        return match ($this->trigger_type) {
            self::TRIGGER_THERAPIST_REGISTRATION => '本人確認完了で残高付与',
            self::TRIGGER_THERAPIST_BOOKING => '予約確定ごとに残高付与',
            self::TRIGGER_USER_FIRST_BOOKING => '初回予約割引',
            self::TRIGGER_USER_BOOKING => '期間中の予約割引',
            default => $this->trigger_type,
        };
    }

    public function benefitSummary(): string
    {
        if ($this->target_role === self::TARGET_THERAPIST) {
            return sprintf('%s円付与', number_format((int) $this->benefit_value));
        }

        if ($this->benefit_type === self::BENEFIT_TYPE_PERCENTAGE) {
            return sprintf('%d%%割引', (int) $this->benefit_value);
        }

        return sprintf('%s円割引', number_format((int) $this->benefit_value));
    }

    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'offer_valid_days' => 'integer',
            'is_enabled' => 'boolean',
        ];
    }
}
