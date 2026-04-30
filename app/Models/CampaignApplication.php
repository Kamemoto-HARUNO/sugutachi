<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Guarded(['id'])]
class CampaignApplication extends Model
{
    public const STATUS_AVAILABLE = 'available';

    public const STATUS_RESERVED = 'reserved';

    public const STATUS_CONSUMED = 'consumed';

    public const STATUS_EXPIRED = 'expired';

    public const STATUS_APPLIED = 'applied';

    public const STATUS_GRANTED = 'granted';

    public function campaign(): BelongsTo
    {
        return $this->belongsTo(Campaign::class);
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function therapistLedgerEntry(): BelongsTo
    {
        return $this->belongsTo(TherapistLedgerEntry::class);
    }

    protected function casts(): array
    {
        return [
            'applied_at' => 'datetime',
            'offer_expires_at' => 'datetime',
            'consumed_at' => 'datetime',
            'metadata_json' => 'array',
        ];
    }
}
