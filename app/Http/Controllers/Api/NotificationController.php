<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AppNotificationResource;
use App\Models\AppNotification;
use App\Services\Notifications\NotificationInbox;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class NotificationController extends Controller
{
    public function __construct(private NotificationInbox $inbox) {}

    private function scoped(Request $request)
    {
        $v = $request->validate(['role' => 'nullable|in:user,therapist,admin']);
        $role = $v['role'] ?? null;
        if ($role) {
            abort_unless($request->user()->roleAssignments()->where('role', $role)->where('status', 'active')->whereNull('revoked_at')->exists(), 403);
        }

        return $this->inbox->scoped($request->user()->id, $role);
    }

    public function index(Request $request): AnonymousResourceCollection
    {
        $v = $request->validate([
            'notification_type' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', Rule::in(AppNotification::STATUSES)],
            'read_status' => ['nullable', Rule::in(['read', 'unread'])],
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $scope = $this->scoped($request);
        $snapshotId = (int) ((clone $scope)->max('id') ?? 0);
        $scope->where('id', '<=', $snapshotId);
        $unreadCount = $this->inbox->grouped($scope)->where('inbox_unread_count', '>', 0)->count();
        if (! empty($v['notification_type'])) {
            $scope->where('notification_type', $v['notification_type']);
        }
        $query = $this->inbox->grouped($scope);
        if (($v['status'] ?? null) === 'read' || ($v['read_status'] ?? null) === 'read') {
            $query->where('inbox_unread_count', 0);
        }
        if (($v['read_status'] ?? null) === 'unread') {
            $query->where('inbox_unread_count', '>', 0);
        }
        if (! empty($v['status']) && $v['status'] !== 'read') {
            $query->where('notifications.status', $v['status']);
        }
        $limit = (int) ($v['limit'] ?? 50);

        return AppNotificationResource::collection($query->orderByDesc('notifications.id')->limit($limit)->get())->additional([
            'meta' => ['unread_count' => $unreadCount, 'snapshot_id' => $snapshotId, 'limit' => $limit,
                'filters' => ['notification_type' => $v['notification_type'] ?? null, 'status' => $v['status'] ?? null, 'read_status' => $v['read_status'] ?? null]],
        ]);
    }

    public function read(Request $request, AppNotification $notification): AppNotificationResource
    {
        $scope = $this->scoped($request);
        abort_unless((clone $scope)->whereKey($notification->id)->exists(), 404);
        // The card id is a high-water mark: a concurrent arrival stays unread.
        $query = $scope->where('id', '<=', $notification->id);
        if ($notification->conversation_key) {
            $query->where('conversation_key', $notification->conversation_key);
        } else {
            $query->whereKey($notification->id);
        }
        $query->whereNull('read_at')->update(['read_at' => now(), 'status' => AppNotification::STATUS_READ]);

        return new AppNotificationResource($notification->refresh());
    }

    public function readAll(Request $request): JsonResponse
    {
        $v = $request->validate(['through_id' => 'nullable|integer|min:0']);
        $scope = $this->scoped($request);
        $through = $v['through_id'] ?? (clone $scope)->max('id') ?? 0;
        $count = (clone $scope)->where('id', '<=', $through)->whereNull('read_at')->update(['read_at' => now(), 'status' => AppNotification::STATUS_READ]);

        return response()->json(['data' => ['updated_count' => $count,
            'unread_count' => $this->inbox->grouped($scope)->where('inbox_unread_count', '>', 0)->count()]]);
    }
}
