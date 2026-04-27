<?php

namespace App\Models;

use App\Models\Concerns\UsesPublicIdRouteKey;
use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Guarded(['id'])]
class TherapistMenu extends Model
{
    use UsesPublicIdRouteKey;

    public function getMinimumDurationMinutesAttribute(): int
    {
        return max(30, (int) $this->duration_minutes);
    }

    public function getDurationStepMinutesAttribute(): int
    {
        return 15;
    }

    public function getHourlyRateAmountAttribute(): int
    {
        $minimumDurationMinutes = $this->minimum_duration_minutes;

        if ($minimumDurationMinutes <= 0) {
            return (int) $this->base_price_amount;
        }

        return (int) round(((int) $this->base_price_amount * 60) / $minimumDurationMinutes);
    }

    public function supportsDuration(int $durationMinutes): bool
    {
        return $durationMinutes >= $this->minimum_duration_minutes;
    }

    public function therapistProfile(): BelongsTo
    {
        return $this->belongsTo(TherapistProfile::class);
    }

    public function pricingRules(): HasMany
    {
        return $this->hasMany(TherapistPricingRule::class);
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class);
    }

    public function bookingQuotes(): HasMany
    {
        return $this->hasMany(BookingQuote::class);
    }

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }
}
