<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Guarded(['id'])]
class PlatformFeeSetting extends Model
{
    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'created_by_account_id');
    }

    protected function casts(): array
    {
        return [
            'value_json' => 'array',
            'active_from' => 'datetime',
            'active_until' => 'datetime',
        ];
    }
}
