<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;

#[Guarded(['id'])]
class FavoriteEventLog extends Model
{
    protected function casts(): array
    {
        return [
            'metadata_json' => 'array',
        ];
    }
}
