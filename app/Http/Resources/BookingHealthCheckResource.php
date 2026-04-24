<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class BookingHealthCheckResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'booking_public_id' => $this->whenLoaded('booking', fn () => $this->booking?->public_id),
            'account_id' => $this->whenLoaded('account', fn () => $this->account?->public_id),
            'role' => $this->role,
            'drinking_status' => $this->drinking_status,
            'has_injury' => $this->has_injury,
            'has_fever' => $this->has_fever,
            'contraindications' => $this->contraindications_json ?? [],
            'notes' => $this->notes_encrypted
                ? rescue(fn () => Crypt::decryptString($this->notes_encrypted), null, false)
                : null,
            'checked_at' => $this->checked_at,
            'created_at' => $this->created_at,
        ];
    }
}
