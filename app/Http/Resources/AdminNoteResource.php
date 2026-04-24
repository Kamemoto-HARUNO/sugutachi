<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class AdminNoteResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'author' => $this->whenLoaded('author', fn () => [
                'public_id' => $this->author?->public_id,
                'display_name' => $this->author?->display_name,
            ]),
            'note' => Crypt::decryptString($this->note_encrypted),
            'created_at' => $this->created_at,
        ];
    }
}
