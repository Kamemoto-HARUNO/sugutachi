<?php

namespace App\Models;

use App\Models\Concerns\UsesPublicIdRouteKey;
use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

#[Guarded(['id'])]
class TherapistProfile extends Model
{
    use UsesPublicIdRouteKey;

    public const STATUS_APPROVED = 'approved';

    public const STATUS_DRAFT = 'draft';

    public const STATUS_PENDING = 'pending';

    public const STATUS_REJECTED = 'rejected';

    public const STATUS_SUSPENDED = 'suspended';

    public function scopeDiscoverableTo(Builder $query, Account $viewer): Builder
    {
        return $query
            ->where('account_id', '!=', $viewer->id)
            ->where('profile_status', self::STATUS_APPROVED)
            ->where('is_online', true)
            ->whereHas('menus', fn (Builder $query) => $query->where('is_active', true))
            ->whereHas('location', fn (Builder $query) => $query->where('is_searchable', true))
            ->whereHas('account', function (Builder $query) use ($viewer): void {
                $query
                    ->where('status', Account::STATUS_ACTIVE)
                    ->whereDoesntHave('blockedByAccounts', fn (Builder $blockedBy) => $blockedBy
                        ->where('blocker_account_id', $viewer->id))
                    ->whereDoesntHave('blockedAccounts', fn (Builder $blocked) => $blocked
                        ->where('blocked_account_id', $viewer->id));
            })
            ->whereHas('account.latestIdentityVerification', fn (Builder $query) => $query
                ->where('status', IdentityVerification::STATUS_APPROVED));
    }

    public function scopeScheduledDiscoverableTo(Builder $query, Account $viewer): Builder
    {
        return $query
            ->where('account_id', '!=', $viewer->id)
            ->where('profile_status', self::STATUS_APPROVED)
            ->whereHas('menus', fn (Builder $query) => $query->where('is_active', true))
            ->whereHas('bookingSetting')
            ->whereHas('availabilitySlots', fn (Builder $query) => $query
                ->where('status', TherapistAvailabilitySlot::STATUS_PUBLISHED)
                ->where('end_at', '>', now()))
            ->whereHas('account', function (Builder $query) use ($viewer): void {
                $query
                    ->where('status', Account::STATUS_ACTIVE)
                    ->whereDoesntHave('blockedByAccounts', fn (Builder $blockedBy) => $blockedBy
                        ->where('blocker_account_id', $viewer->id))
                    ->whereDoesntHave('blockedAccounts', fn (Builder $blocked) => $blocked
                        ->where('blocked_account_id', $viewer->id));
            })
            ->whereHas('account.latestIdentityVerification', fn (Builder $query) => $query
                ->where('status', IdentityVerification::STATUS_APPROVED));
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'approved_by_account_id');
    }

    public function photos(): HasMany
    {
        return $this->hasMany(ProfilePhoto::class);
    }

    public function menus(): HasMany
    {
        return $this->hasMany(TherapistMenu::class);
    }

    public function pricingRules(): HasMany
    {
        return $this->hasMany(TherapistPricingRule::class);
    }

    public function bookingSetting(): HasOne
    {
        return $this->hasOne(TherapistBookingSetting::class);
    }

    public function availabilitySlots(): HasMany
    {
        return $this->hasMany(TherapistAvailabilitySlot::class);
    }

    public function location(): HasOne
    {
        return $this->hasOne(TherapistLocation::class);
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class);
    }

    public function bookingQuotes(): HasMany
    {
        return $this->hasMany(BookingQuote::class);
    }

    public function stripeConnectedAccount(): HasOne
    {
        return $this->hasOne(StripeConnectedAccount::class);
    }

    public function travelRequests(): HasMany
    {
        return $this->hasMany(TherapistTravelRequest::class);
    }

    protected function casts(): array
    {
        return [
            'is_online' => 'boolean',
            'online_since' => 'datetime',
            'last_location_updated_at' => 'datetime',
            'rating_average' => 'decimal:2',
            'therapist_cancellation_count' => 'integer',
            'approved_at' => 'datetime',
        ];
    }
}
