<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Guarded(['id'])]
class IdentityVerification extends Model
{
    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'reviewed_by_account_id');
    }

    protected function casts(): array
    {
        return [
            'is_age_verified' => 'boolean',
            'self_declared_male' => 'boolean',
            'submitted_at' => 'datetime',
            'reviewed_at' => 'datetime',
            'purge_after' => 'datetime',
        ];
    }
}
