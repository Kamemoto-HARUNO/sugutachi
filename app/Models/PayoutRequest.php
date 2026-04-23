<?php

namespace App\Models;

use App\Models\Concerns\UsesPublicIdRouteKey;
use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Guarded(['id'])]
class PayoutRequest extends Model
{
    use UsesPublicIdRouteKey;

    public function therapistAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'therapist_account_id');
    }

    public function stripeConnectedAccount(): BelongsTo
    {
        return $this->belongsTo(StripeConnectedAccount::class);
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'reviewed_by_account_id');
    }

    public function ledgerEntries(): HasMany
    {
        return $this->hasMany(TherapistLedgerEntry::class);
    }

    protected function casts(): array
    {
        return [
            'requested_at' => 'datetime',
            'scheduled_process_date' => 'date',
            'processed_at' => 'datetime',
        ];
    }
}
