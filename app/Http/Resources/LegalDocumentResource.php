<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LegalDocumentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'document_type' => $this->document_type,
            'version' => $this->version,
            'title' => $this->title,
            'body' => $this->body,
            'published_at' => $this->published_at,
            'effective_at' => $this->effective_at,
            'is_published' => $this->published_at !== null,
            'acceptances_count' => $this->whenCounted('acceptances'),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
