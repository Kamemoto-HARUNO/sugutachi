<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ServiceAddressResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'public_id' => $this->public_id,
            'label' => $this->label,
            'place_type' => $this->place_type,
            'prefecture' => $this->prefecture,
            'city' => $this->city,
            'is_default' => $this->is_default,
            'created_at' => $this->created_at,
        ];
    }
}
