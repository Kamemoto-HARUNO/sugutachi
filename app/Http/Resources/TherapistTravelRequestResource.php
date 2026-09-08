<?php

namespace App\Http\Resources;

use App\Services\DirectMessages\ParticipantPresenter;
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
            'sender' => $this->userAccount ? app(ParticipantPresenter::class)->present($this->userAccount, 'user') : null,
            'therapist_profile_id' => $this->whenLoaded('therapistProfile', fn () => $this->therapistProfile?->public_id),
            'created_at' => $this->created_at,
        ];
    }
}
