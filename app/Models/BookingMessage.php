<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Guarded(['id'])]
class BookingMessage extends Model
{
    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'sender_account_id');
    }

    protected function casts(): array
    {
        return [
            'detected_contact_exchange' => 'boolean',
            'sent_at' => 'datetime',
            'read_at' => 'datetime',
        ];
    }
}
