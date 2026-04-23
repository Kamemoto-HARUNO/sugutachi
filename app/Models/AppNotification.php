<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Guarded(['id'])]
class AppNotification extends Model
{
    protected $table = 'notifications';

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    protected function casts(): array
    {
        return [
            'data_json' => 'array',
            'sent_at' => 'datetime',
            'read_at' => 'datetime',
        ];
    }
}
