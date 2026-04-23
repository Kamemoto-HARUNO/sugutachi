<?php

namespace App\Models;

use App\Models\Concerns\UsesPublicIdRouteKey;
use Illuminate\Database\Eloquent\Attributes\Guarded;
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

    protected function casts(): array
    {
        return [
            'is_online' => 'boolean',
            'online_since' => 'datetime',
            'last_location_updated_at' => 'datetime',
            'rating_average' => 'decimal:2',
            'approved_at' => 'datetime',
        ];
    }
}
