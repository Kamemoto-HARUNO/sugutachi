<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\BookingMessage;
use App\Models\DirectMessage;
use App\Services\Notifications\NotificationInbox;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UnreadSummaryController extends Controller
{
    public function __invoke(Request $request, NotificationInbox $inbox): JsonResponse
    {
        $account = $request->user();
        abort_unless($account->status === Account::STATUS_ACTIVE, 403);
        $roles = $account->roleAssignments()->where('status', 'active')->whereNull('revoked_at')
            ->whereIn('role', ['user', 'therapist', 'admin'])->pluck('role')->unique();
        $summary = [];
        foreach ($roles as $role) {
            $messageCount = 0;
            $unreadConversations = [];
            if (in_array($role, ['user', 'therapist'], true)) {
                $dm = DirectMessage::query()->where('sender_role', '!=', $role)->whereNull('read_at')->visibleContent()
                    ->whereHas('thread.relationship', fn ($q) => $q->where($role.'_account_id', $account->id))
                    ->selectRaw('thread_id, COUNT(*) AS unread_count')->groupBy('thread_id')->with('thread:id,public_id')->get();
                foreach ($dm as $group) {
                    $messageCount += (int) $group->unread_count;
                    $unreadConversations[] = 'dm:'.$role.':'.$group->thread->public_id;
                }
                $bookings = BookingMessage::query()->whereNull('read_at')->where('sender_account_id', '!=', $account->id)
                    ->whereHas('booking', fn ($q) => $q->where($role.'_account_id', $account->id)
                        // Match Booking::canViewMessageThreadForRole: closed threads remain visible to casts.
                        ->when($role === 'user', fn ($q) => $q->whereNull('messages_closed_at')))
                    ->selectRaw('booking_id, COUNT(*) AS unread_count')->groupBy('booking_id')->with('booking:id,public_id')->get();
                foreach ($bookings as $group) {
                    $messageCount += (int) $group->unread_count;
                    $unreadConversations[] = 'booking:'.$role.':'.$group->booking->public_id;
                }
            }
            $notifications = $inbox->grouped($inbox->scoped($account->id, $role))->where('inbox_unread_count', '>', 0);
            $notificationCount = (clone $notifications)->count();
            // A conversation represented in messages must not also inflate the combined badge.
            $additionalNotifications = $notifications->where(fn ($q) => $q->whereNull('conversation_key')
                ->orWhereNotIn('conversation_key', $unreadConversations))->count();
            $summary[$role] = ['messages' => $messageCount, 'notifications' => $notificationCount,
                'total' => $messageCount + $additionalNotifications];
        }

        // Counts only: switching modes must never reveal another profile's counterpart or content.
        return response()->json(['data' => ['roles' => (object) $summary]])->header('Cache-Control', 'private, no-store');
    }
}
