<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AppNotificationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'notification_type' => $this->notification_type,
            'channel' => $this->channel,
            'title' => $this->title,
            'body' => $this->body,
            'data' => $this->data_json,
            'status' => $this->status,
            'sent_at' => $this->sent_at,
            'read_at' => $this->read_at,
            'created_at' => $this->created_at,
        ];
    }
}
