<?php

namespace App\Services\Notifications;

use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\BookingMessage;
use App\Models\DirectMessage;
use App\Models\SupportTicket;
use Illuminate\Database\Eloquent\Builder;

class NotificationInbox
{
    public function metadata(AppNotification $notification): array
    {
        $data = $notification->data_json ?? [];
        $path = is_string($data['target_path'] ?? null) ? $data['target_path'] : '';
        $role = $data['target_role'] ?? null;
        if (! in_array($role, ['user', 'therapist', 'admin', 'shared'], true)) {
            $role = null;
            if (preg_match('#^/(user|therapist|admin)(?:/|\?|$)#', $path, $match)) {
                $role = $match[1];
            }
        }
        if (! $role && ! empty($data['booking_public_id'])) {
            $booking = Booking::where('public_id', $data['booking_public_id'])->first();
            if ($booking) {
                $role = $booking->user_account_id === $notification->account_id ? 'user'
                    : ($booking->therapist_account_id === $notification->account_id ? 'therapist' : null);
            }
        }
        if (! $role && ! empty($data['support_ticket_public_id'])) {
            $ticket = SupportTicket::where('public_id', $data['support_ticket_public_id'])->where('account_id', $notification->account_id)->first();
            $role = $ticket?->requester_role;
        }
        // Only unambiguous notification types can recover old missing audiences.
        $role ??= match ($notification->notification_type) {
            'booking_requested', 'booking_confirmed', 'booking_start_reminder',
            'booking_adjustment_accepted', 'booking_no_show_confirmed', 'booking_no_show_disputed',
            'travel_request_received', 'therapist_favorite_added' => 'therapist',
            'booking_accepted', 'booking_adjustment_proposed', 'booking_no_show_reported',
            'booking_moving', 'booking_arrived', 'booking_started', 'booking_therapist_completed',
            'booking_completion_window_updated', 'booking_completion_reminder', 'booking_refunded',
            'travel_request_warning', 'travel_request_restricted', 'favorite_therapist_online',
            'favorite_therapist_availability' => 'user',
            'identity_verification_submitted', 'contact_inquiry_received', 'refund_requested',
            'payout_requested', 'report_created' => 'admin',
            default => 'unknown',
        };
        $conversation = null;
        if ($notification->notification_type === 'direct_message_received'
            && preg_match('#^/(user|therapist)/direct-messages/([^/?]+)$#', $path, $match)
            && $match[1] === $role) {
            $conversation = 'dm:'.$role.':'.$match[2];
        }
        if ($notification->notification_type === 'booking_message_received' && in_array($role, ['user', 'therapist']) && ! empty($data['booking_public_id'])) {
            $conversation = 'booking:'.$role.':'.$data['booking_public_id'];
        }

        return ['audience_role' => $role, 'conversation_key' => $conversation];
    }

    public function scoped(int $accountId, ?string $role): Builder
    {
        return AppNotification::where('account_id', $accountId)->where('channel', 'in_app')
            ->whereIn('audience_role', $role ? [$role, 'shared'] : ['shared']);
    }

    public function grouped(Builder $scope): Builder
    {
        $groups = (clone $scope)->selectRaw('MAX(id) AS latest_id, SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END) AS inbox_unread_count')
            ->groupByRaw('COALESCE(conversation_key, id)');

        return AppNotification::query()->joinSub($groups, 'inbox_groups', 'notifications.id', '=', 'inbox_groups.latest_id')
            ->select('notifications.*', 'inbox_groups.inbox_unread_count');
    }

    public function readMessage(int $accountId, string $role, string $type, string $field, array $ids): void
    {
        $this->scoped($accountId, $role)->where('notification_type', $type)
            ->whereIn('data_json->'.$field, $ids)->whereNull('read_at')
            ->update(['read_at' => now(), 'status' => AppNotification::STATUS_READ]);
    }

    public function reconcile(AppNotification $notification): void
    {
        $notification->forceFill($this->metadata($notification));
        $data = $notification->data_json ?? [];
        $readAt = null;
        if ($notification->notification_type === 'direct_message_received' && ! empty($data['direct_message_id'])) {
            $message = DirectMessage::with('thread.relationship')->where('public_id', $data['direct_message_id'])->first();
            $role = $notification->audience_role;
            if ($message && in_array($role, ['user', 'therapist']) && $message->sender_role !== $role
                && $message->thread->relationship->accountId($role) === $notification->account_id) {
                $readAt = $message->read_at;
            }
        }
        if ($notification->notification_type === 'booking_message_received' && ! empty($data['message_id'])) {
            $message = BookingMessage::with('booking')->find($data['message_id']);
            if ($message && $message->booking?->public_id === ($data['booking_public_id'] ?? null)
                && $message->sender_account_id !== $notification->account_id
                && in_array($notification->account_id, [$message->booking->user_account_id, $message->booking->therapist_account_id], true)) {
                $readAt = $message->read_at;
            }
        }
        if ($readAt && ! $notification->read_at) {
            $notification->forceFill(['read_at' => $readAt, 'status' => AppNotification::STATUS_READ]);
        }
        if ($notification->isDirty()) {
            $notification->saveQuietly();
        }
    }
}
