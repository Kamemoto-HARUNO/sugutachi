<?php

namespace App\Console\Commands;

use App\Services\DirectMessages\BlockBookingSettlement;
use App\Services\DirectMessages\DirectMessageDelivery;
use App\Services\DirectMessages\DirectMessageRetention;
use App\Services\DirectMessages\SystemNoticeDelivery;
use Illuminate\Console\Command;

class ProcessDirectMessages extends Command
{
    protected $signature = 'direct-messages:process {--purge : Apply message/evidence retention}';

    protected $description = 'Deliver due DM notifications and reconcile blocked booking cancellations';

    public function handle(): int
    {
        if ($this->option('purge')) {
            $count = app(DirectMessageRetention::class)->run();
            $this->info('Deleted expired message contents: '.$count);
        } else {
            app(DirectMessageDelivery::class)->run();
            // Booking compensation stays active when the DM feature is switched off.
            app(BlockBookingSettlement::class)->run();
            app(SystemNoticeDelivery::class)->run();
        }

        return self::SUCCESS;
    }
}
