<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Guarded(['id'])]
class TherapistLedgerEntry extends Model
{
    public function therapistAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'therapist_account_id');
    }

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function payoutRequest(): BelongsTo
    {
        return $this->belongsTo(PayoutRequest::class);
    }

    protected function casts(): array
    {
        return [
            'available_at' => 'datetime',
            'metadata_json' => 'array',
        ];
    }
}
