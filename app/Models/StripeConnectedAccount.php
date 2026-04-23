<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Guarded(['id'])]
class StripeConnectedAccount extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_REQUIREMENTS_DUE = 'requirements_due';

    public const STATUS_ACTIVE = 'active';

    public const STATUS_RESTRICTED = 'restricted';

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function therapistProfile(): BelongsTo
    {
        return $this->belongsTo(TherapistProfile::class);
    }

    public function paymentIntents(): HasMany
    {
        return $this->hasMany(PaymentIntent::class);
    }

    public function payoutRequests(): HasMany
    {
        return $this->hasMany(PayoutRequest::class);
    }

    protected function casts(): array
    {
        return [
            'charges_enabled' => 'boolean',
            'payouts_enabled' => 'boolean',
            'details_submitted' => 'boolean',
            'requirements_currently_due_json' => 'array',
            'requirements_past_due_json' => 'array',
            'onboarding_completed_at' => 'datetime',
            'last_synced_at' => 'datetime',
        ];
    }
}
