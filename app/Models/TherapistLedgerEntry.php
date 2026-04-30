<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Guarded(['id'])]
class TherapistLedgerEntry extends Model
{
    public const TYPE_BOOKING_SALE = 'booking_sale';

    public const TYPE_REFUND_ADJUSTMENT = 'refund_adjustment';

    public const TYPE_CAMPAIGN_BONUS = 'campaign_bonus';

    public const STATUS_PENDING = 'pending';

    public const STATUS_AVAILABLE = 'available';

    public const STATUS_PAYOUT_REQUESTED = 'payout_requested';

    public const STATUS_PAID = 'paid';

    public const STATUS_HELD = 'held';

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
