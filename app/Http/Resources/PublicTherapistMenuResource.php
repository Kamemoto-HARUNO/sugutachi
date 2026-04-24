<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PublicTherapistMenuResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'public_id' => data_get($this->resource, 'public_id'),
            'name' => data_get($this->resource, 'name'),
            'description' => data_get($this->resource, 'description'),
            'duration_minutes' => data_get($this->resource, 'duration_minutes'),
            'base_price_amount' => data_get($this->resource, 'base_price_amount'),
            'estimated_total_amount' => data_get($this->resource, 'estimated_total_amount'),
        ];
    }
}
