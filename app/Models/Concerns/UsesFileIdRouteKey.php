<?php

namespace App\Models\Concerns;

trait UsesFileIdRouteKey
{
    public function getRouteKeyName(): string
    {
        return 'file_id';
    }
}
