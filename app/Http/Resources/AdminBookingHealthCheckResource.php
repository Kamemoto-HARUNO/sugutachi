<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class AdminBookingHealthCheckResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'booking_public_id' => $this->whenLoaded('booking', fn () => $this->booking?->public_id),
            'account' => $this->whenLoaded('account', fn () => $this->account ? [
                'public_id' => $this->account->public_id,
                'display_name' => $this->account->display_name,
                'email' => $this->account->email,
                'status' => $this->account->status,
            ] : null),
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
