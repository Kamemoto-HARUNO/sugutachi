<?php

namespace App\Models;

use App\Models\Concerns\UsesPublicIdRouteKey;
use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

#[Guarded(['id'])]
class BookingQuote extends Model
{
    use UsesPublicIdRouteKey;

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function therapistProfile(): BelongsTo
    {
        return $this->belongsTo(TherapistProfile::class);
    }

    public function therapistMenu(): BelongsTo
    {
        return $this->belongsTo(TherapistMenu::class);
    }

    public function selectedByBooking(): HasOne
    {
        return $this->hasOne(Booking::class, 'current_quote_id');
    }

    protected function casts(): array
    {
        return [
            'input_snapshot_json' => 'array',
            'applied_rules_json' => 'array',
            'discount_snapshot_json' => 'array',
            'expires_at' => 'datetime',
        ];
    }
}
