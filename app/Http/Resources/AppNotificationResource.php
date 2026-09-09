<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AppNotificationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $targetRole = $this->audience_role;
        $unreadCount = $this->resource->getAttribute('inbox_unread_count');
        $isRead = $unreadCount !== null ? (int) $unreadCount === 0 : (bool) $this->read_at;
        $isConversation = (bool) $this->conversation_key;

        return [
            'id' => $this->id,
            'notification_type' => $this->notification_type,
            'channel' => $this->channel,
            'title' => $this->title,
            'body' => $isConversation ? ($isRead ? '通知を確認しました。' : '新しいメッセージが'.($unreadCount ?? 1).'件あります。') : $this->body,
            'conversation_key' => $this->conversation_key,
            'unread_message_count' => $isConversation ? (int) ($unreadCount ?? ($isRead ? 0 : 1)) : null,
            'data' => $this->data_json,
            'target_role' => $targetRole,
            'status' => $isRead ? 'read' : ($this->status === 'read' ? 'sent' : $this->status),
            'is_read' => $isRead,
            'sent_at' => $this->sent_at,
            'read_at' => $isRead ? $this->read_at : null,
            'created_at' => $this->created_at,
        ];
    }
}
