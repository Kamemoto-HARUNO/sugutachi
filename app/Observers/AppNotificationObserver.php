<?php

namespace App\Observers;

use App\Models\AppNotification;
use App\Services\Notifications\AppNotificationEmailDeliveryService;
use App\Services\Notifications\WebPushDeliveryService;

class AppNotificationObserver
{
    public function created(AppNotification $notification): void
    {
        if ($notification->notification_type === 'direct_message_received') {
            return;
        }

        app(WebPushDeliveryService::class)->deliverForNotification($notification);
        app(AppNotificationEmailDeliveryService::class)->deliverForNotification($notification);
    }
}
