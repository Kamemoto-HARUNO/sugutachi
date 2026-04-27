<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AppNotificationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $targetRole = $this->resolveTargetRole();

        return [
            'id' => $this->id,
            'notification_type' => $this->notification_type,
            'channel' => $this->channel,
            'title' => $this->title,
            'body' => $this->body,
            'data' => $this->data_json,
            'target_role' => $targetRole,
            'status' => $this->status,
            'is_read' => (bool) $this->read_at,
            'sent_at' => $this->sent_at,
            'read_at' => $this->read_at,
            'created_at' => $this->created_at,
        ];
    }

    private function resolveTargetRole(): ?string
    {
        $targetRole = data_get($this->data_json, 'target_role');

        if (in_array($targetRole, ['user', 'therapist', 'admin'], true)) {
            return $targetRole;
        }

        $targetPath = data_get($this->data_json, 'target_path');

        if (is_string($targetPath)) {
            if (str_starts_with($targetPath, '/user')) {
                return 'user';
            }

            if (str_starts_with($targetPath, '/therapist')) {
                return 'therapist';
            }

            if (str_starts_with($targetPath, '/admin')) {
                return 'admin';
            }
        }

        return match ($this->notification_type) {
            'booking_requested',
            'booking_adjustment_accepted',
            'booking_no_show_confirmed',
            'booking_no_show_disputed',
            'travel_request_received' => 'therapist',
            'booking_accepted',
            'booking_adjustment_proposed',
            'booking_no_show_reported',
            'booking_moving',
            'booking_arrived',
            'booking_started',
            'booking_therapist_completed',
            'booking_completion_window_updated',
            'booking_completion_reminder',
            'booking_refunded',
            'travel_request_warning',
            'travel_request_restricted' => 'user',
            default => null,
        };
    }
}
