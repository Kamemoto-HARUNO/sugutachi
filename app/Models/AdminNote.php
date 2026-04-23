<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Guarded(['id'])]
class AdminNote extends Model
{
    public function author(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'author_account_id');
    }
}
