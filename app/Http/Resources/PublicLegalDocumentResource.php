<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PublicLegalDocumentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'public_id' => $this->public_id,
            'document_type' => $this->document_type,
            'version' => $this->version,
            'title' => $this->title,
            'body' => $this->body,
            'path' => "/api/legal-documents/{$this->document_type}",
            'accept_path' => "/api/legal-documents/{$this->public_id}/accept",
            'published_at' => $this->published_at,
            'effective_at' => $this->effective_at,
        ];
    }
}
