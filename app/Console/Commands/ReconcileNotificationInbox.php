<?php

namespace App\Console\Commands;

use App\Models\AppNotification;
use App\Services\Notifications\NotificationInbox;
use Illuminate\Console\Command;

class ReconcileNotificationInbox extends Command
{
    protected $signature = 'notifications:reconcile-inbox';

    protected $description = 'Classify existing notifications and sync already-read messages without sending notifications';

    public function handle(NotificationInbox $inbox): int
    {
        $count = 0;
        AppNotification::query()->chunkById(200, function ($notifications) use ($inbox, &$count) {
            foreach ($notifications as $notification) {
                $inbox->reconcile($notification);
                $count++;
            }
        });
        $this->info('Reconciled '.$count.' notifications. Unknown audience: '.AppNotification::where('audience_role', 'unknown')->count());

        return self::SUCCESS;
    }
}
