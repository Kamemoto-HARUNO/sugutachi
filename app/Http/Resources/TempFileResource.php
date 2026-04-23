<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TempFileResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'file_id' => $this->file_id,
            'purpose' => $this->purpose,
            'original_name' => $this->original_name,
            'mime_type' => $this->mime_type,
            'size_bytes' => $this->size_bytes,
            'status' => $this->status,
            'expires_at' => $this->expires_at,
            'used_at' => $this->used_at,
            'created_at' => $this->created_at,
        ];
    }
}
