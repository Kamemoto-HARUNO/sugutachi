<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class TherapistTravelRequestResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'public_id' => $this->public_id,
            'prefecture' => $this->prefecture,
            'message' => rescue(fn () => Crypt::decryptString($this->message_encrypted), null, false),
            'status' => $this->status,
            'read_at' => $this->read_at,
            'archived_at' => $this->archived_at,
            'sender' => $this->whenLoaded('userAccount', fn () => [
                'public_id' => $this->userAccount?->public_id,
                'display_name' => $this->userAccount?->display_name,
            ]),
            'therapist_profile_id' => $this->whenLoaded('therapistProfile', fn () => $this->therapistProfile?->public_id),
            'created_at' => $this->created_at,
        ];
    }
}
