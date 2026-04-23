<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AppNotificationResource;
use App\Models\AppNotification;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class NotificationController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        return AppNotificationResource::collection(
            $request->user()
                ->appNotifications()
                ->latest()
                ->limit(50)
                ->get()
        );
    }

    public function read(Request $request, AppNotification $notification): AppNotificationResource
    {
        abort_unless($notification->account_id === $request->user()->id, 404);

        if (! $notification->read_at) {
            $notification->forceFill(['read_at' => now()])->save();
        }

        return new AppNotificationResource($notification->refresh());
    }
}
