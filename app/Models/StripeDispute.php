<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Guarded(['id'])]
class StripeDispute extends Model
{
    public const STATUS_NEEDS_RESPONSE = 'needs_response';

    public const STATUS_UNDER_REVIEW = 'under_review';

    public const STATUS_WON = 'won';

    public const STATUS_LOST = 'lost';

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function paymentIntent(): BelongsTo
    {
        return $this->belongsTo(PaymentIntent::class);
    }

    protected function casts(): array
    {
        return [
            'evidence_due_by' => 'datetime',
        ];
    }
}
