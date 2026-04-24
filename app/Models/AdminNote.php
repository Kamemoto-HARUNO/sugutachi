<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

#[Guarded(['id'])]
class AdminNote extends Model
{
    public function author(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'author_account_id');
    }

    public function target(): MorphTo
    {
        return $this->morphTo();
    }
}
