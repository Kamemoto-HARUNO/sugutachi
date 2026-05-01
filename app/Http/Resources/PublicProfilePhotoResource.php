<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PublicProfilePhotoResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'sort_order' => data_get($this->resource, 'sort_order'),
            'url' => data_get($this->resource, 'url'),
        ];
    }
}
