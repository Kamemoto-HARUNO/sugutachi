<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Guarded(['id'])]
class Review extends Model
{
    public const STATUS_VISIBLE = 'visible';

    public const STATUS_HIDDEN = 'hidden';

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'reviewer_account_id');
    }

    public function reviewee(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'reviewee_account_id');
    }

    public function moderatedBy(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'moderated_by_account_id');
    }

    protected function casts(): array
    {
        return [
            'moderated_at' => 'datetime',
        ];
    }
}
