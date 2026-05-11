<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Guarded(['id'])]
class BlogCategory extends Model
{
    public function posts(): HasMany
    {
        return $this->hasMany(BlogPost::class);
    }
}
