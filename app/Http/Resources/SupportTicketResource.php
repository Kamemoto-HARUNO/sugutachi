<?php

namespace App\Http\Resources;

use App\Models\SupportTicketMessage;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class SupportTicketResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $viewerRole = $this->resource->getAttribute('viewer_role');
        $isAdminViewer = $viewerRole === 'admin';
        $latestMessage = $this->relationLoaded('latestMessage') ? $this->latestMessage->first() : null;

        return [
            'public_id' => $this->public_id,
            'account' => $this->whenLoaded('account', fn () => $this->account ? [
                'public_id' => $this->account->public_id,
                'display_name' => $this->account->display_name,
                'email' => $isAdminViewer ? $this->account->email : null,
                'status' => $this->account->status,
            ] : null),
            'requester_role' => $this->requester_role,
            'origin' => $this->origin,
            'title' => $this->title,
            'category' => $this->category,
            'status' => $this->status,
            'can_send' => $this->isOpen(),
            'unread_count' => $this->unread_count ?? 0,
            'last_message_excerpt' => $latestMessage ? $this->messageExcerpt($latestMessage) : null,
            'last_message_at' => $this->last_message_at,
            'created_by' => $this->whenLoaded('createdBy', fn () => $this->createdBy ? [
                'public_id' => $isAdminViewer ? $this->createdBy->public_id : null,
                'display_name' => $this->createdBy->display_name,
            ] : null),
            'completed_by_admin' => $this->when($isAdminViewer && $this->relationLoaded('completedByAdmin'), fn () => $this->completedByAdmin ? [
                'public_id' => $this->completedByAdmin->public_id,
                'display_name' => $this->completedByAdmin->display_name,
            ] : null),
            'completed_at' => $this->completed_at,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            'messages' => SupportTicketMessageResource::collection($this->whenLoaded('messages')),
        ];
    }

    private function messageExcerpt(SupportTicketMessage $message): string
    {
        if ($message->message_type === SupportTicketMessage::TYPE_IMAGE) {
            return '画像';
        }

        $body = $message->body_encrypted ? Crypt::decryptString($message->body_encrypted) : '';

        return mb_strimwidth($body, 0, 80, '...');
    }
}
