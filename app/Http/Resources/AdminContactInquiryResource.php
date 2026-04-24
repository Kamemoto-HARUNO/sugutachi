<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AdminContactInquiryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'public_id' => $this->public_id,
            'account' => $this->whenLoaded('account', fn () => $this->account ? [
                'public_id' => $this->account->public_id,
                'display_name' => $this->account->display_name,
                'email' => $this->account->email,
            ] : null),
            'name' => $this->name,
            'email' => $this->email,
            'category' => $this->category,
            'message' => $this->message,
            'status' => $this->status,
            'source' => $this->source,
            'resolved_at' => $this->resolved_at,
            'notes' => AdminNoteResource::collection($this->whenLoaded('adminNotes')),
            'submitted_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
