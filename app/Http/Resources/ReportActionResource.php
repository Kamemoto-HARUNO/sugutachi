<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class ReportActionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'action_type' => $this->action_type,
            'note' => $this->note_encrypted ? Crypt::decryptString($this->note_encrypted) : null,
            'metadata' => $this->metadata_json,
            'admin' => $this->whenLoaded('admin', fn () => [
                'public_id' => $this->admin?->public_id,
                'display_name' => $this->admin?->display_name,
            ]),
            'created_at' => $this->created_at,
        ];
    }
}
