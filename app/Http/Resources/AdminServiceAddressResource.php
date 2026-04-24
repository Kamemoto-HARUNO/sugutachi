<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;
use Throwable;

class AdminServiceAddressResource extends JsonResource
{
    public function __construct($resource, private readonly bool $includeSensitive = false)
    {
        parent::__construct($resource);
    }

    public function toArray(Request $request): array
    {
        $data = [
            'public_id' => $this->public_id,
            'label' => $this->label,
            'place_type' => $this->place_type,
            'prefecture' => $this->prefecture,
            'city' => $this->city,
            'lat' => $this->lat,
            'lng' => $this->lng,
            'is_default' => $this->is_default,
        ];

        if (! $this->includeSensitive) {
            return $data;
        }

        return array_merge($data, [
            'postal_code' => $this->decryptNullable($this->postal_code_encrypted),
            'address_line' => $this->decryptNullable($this->address_line_encrypted),
            'building' => $this->decryptNullable($this->building_encrypted),
            'access_notes' => $this->decryptNullable($this->access_notes_encrypted),
        ]);
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
