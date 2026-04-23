<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Guarded(['id'])]
class AdminAuditLog extends Model
{
    public const UPDATED_AT = null;

    public function actor(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'actor_account_id');
    }

    protected function casts(): array
    {
        return [
            'before_json' => 'array',
            'after_json' => 'array',
            'created_at' => 'datetime',
        ];
    }
}
