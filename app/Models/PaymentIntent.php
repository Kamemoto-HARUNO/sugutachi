<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Guarded(['id'])]
class PaymentIntent extends Model
{
    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function payer(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'payer_account_id');
    }

    public function stripeConnectedAccount(): BelongsTo
    {
        return $this->belongsTo(StripeConnectedAccount::class);
    }

    public function refunds(): HasMany
    {
        return $this->hasMany(Refund::class);
    }

    public function disputes(): HasMany
    {
        return $this->hasMany(StripeDispute::class);
    }

    protected function casts(): array
    {
        return [
            'is_current' => 'boolean',
            'authorized_at' => 'datetime',
            'captured_at' => 'datetime',
            'canceled_at' => 'datetime',
            'metadata_json' => 'array',
        ];
    }
}
