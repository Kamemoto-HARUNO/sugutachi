<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Guarded(['id'])]
class LegalDocument extends Model
{
    public function acceptances(): HasMany
    {
        return $this->hasMany(LegalAcceptance::class);
    }

    public function bookingConsents(): HasMany
    {
        return $this->hasMany(BookingConsent::class);
    }

    protected function casts(): array
    {
        return [
            'published_at' => 'datetime',
            'effective_at' => 'datetime',
        ];
    }
}
