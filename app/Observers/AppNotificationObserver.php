<?php

namespace App\Observers;

use App\Models\AppNotification;
use App\Services\Notifications\WebPushDeliveryService;

class AppNotificationObserver
{
    public function created(AppNotification $notification): void
    {
        app(WebPushDeliveryService::class)->deliverForNotification($notification);
    }
}
