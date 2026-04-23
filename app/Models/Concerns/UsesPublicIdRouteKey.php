<?php

namespace App\Models\Concerns;

trait UsesPublicIdRouteKey
{
    public function getRouteKeyName(): string
    {
        return 'public_id';
    }
}
