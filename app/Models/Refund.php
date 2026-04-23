<?php

namespace App\Models;

use App\Models\Concerns\UsesPublicIdRouteKey;
use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Guarded(['id'])]
class Refund extends Model
{
    use UsesPublicIdRouteKey;

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function paymentIntent(): BelongsTo
    {
        return $this->belongsTo(PaymentIntent::class);
    }

    public function requestedBy(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'requested_by_account_id');
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'reviewed_by_account_id');
    }

    protected function casts(): array
    {
        return [
            'reviewed_at' => 'datetime',
            'processed_at' => 'datetime',
        ];
    }
}
