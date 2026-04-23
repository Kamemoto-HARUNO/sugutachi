<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Guarded(['id'])]
class AccountBlock extends Model
{
    public function blocker(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'blocker_account_id');
    }

    public function blocked(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'blocked_account_id');
    }
}
