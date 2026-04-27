<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AppNotificationResource;
use App\Models\AppNotification;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class NotificationController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $validated = $request->validate([
            'notification_type' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', Rule::in(AppNotification::STATUSES)],
            'read_status' => ['nullable', Rule::in(['read', 'unread'])],
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $account = $request->user();
        $limit = (int) ($validated['limit'] ?? 50);

        $query = $account->appNotifications()->latest();

        if (filled($validated['notification_type'] ?? null)) {
            $query->where('notification_type', $validated['notification_type']);
        }

        if (filled($validated['status'] ?? null)) {
            if ($validated['status'] === AppNotification::STATUS_READ) {
                $query->whereNotNull('read_at');
            } else {
                $query->where('status', $validated['status']);
            }
        }

        match ($validated['read_status'] ?? null) {
            'read' => $query->whereNotNull('read_at'),
            'unread' => $query->whereNull('read_at'),
            default => null,
        };

        $notifications = $query->limit($limit)->get();
        $unreadCount = $account->appNotifications()->whereNull('read_at')->count();

        return AppNotificationResource::collection($notifications)->additional([
            'meta' => [
                'unread_count' => $unreadCount,
                'limit' => $limit,
                'filters' => [
                    'notification_type' => $validated['notification_type'] ?? null,
                    'status' => $validated['status'] ?? null,
                    'read_status' => $validated['read_status'] ?? null,
                ],
            ],
        ]);
    }

    public function read(Request $request, AppNotification $notification): AppNotificationResource
    {
        abort_unless($notification->account_id === $request->user()->id, 404);

        if (! $notification->read_at || $notification->status !== AppNotification::STATUS_READ) {
            $notification->forceFill([
                'read_at' => $notification->read_at ?? now(),
                'status' => AppNotification::STATUS_READ,
            ])->save();
        }

        return new AppNotificationResource($notification->refresh());
    }

    public function readAll(Request $request): JsonResponse
    {
        $account = $request->user();

        $updatedCount = $account->appNotifications()
            ->whereNull('read_at')
            ->update([
                'read_at' => now(),
                'status' => AppNotification::STATUS_READ,
            ]);

        return response()->json([
            'data' => [
                'updated_count' => $updatedCount,
                'unread_count' => 0,
            ],
        ]);
    }
}
