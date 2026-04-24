<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;
use Throwable;

class ServiceAddressResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'public_id' => $this->public_id,
            'label' => $this->label,
            'place_type' => $this->place_type,
            'postal_code' => $this->decryptNullable($this->postal_code_encrypted),
            'prefecture' => $this->prefecture,
            'city' => $this->city,
            'address_line' => $this->decryptNullable($this->address_line_encrypted),
            'building' => $this->decryptNullable($this->building_encrypted),
            'access_notes' => $this->decryptNullable($this->access_notes_encrypted),
            'lat' => $this->lat,
            'lng' => $this->lng,
            'is_default' => $this->is_default,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }

    private function decryptNullable(?string $value): ?string
    {
        if (blank($value)) {
            return null;
        }

        try {
            return Crypt::decryptString($value);
        } catch (Throwable) {
            return null;
        }
    }
}
