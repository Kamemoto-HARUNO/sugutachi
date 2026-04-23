<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Guarded(['id'])]
class LocationSearchLog extends Model
{
    public const UPDATED_AT = null;

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    protected function casts(): array
    {
        return [
            'searched_lat' => 'decimal:7',
            'searched_lng' => 'decimal:7',
            'created_at' => 'datetime',
        ];
    }
}
