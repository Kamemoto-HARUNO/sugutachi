<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class DirectMessageMetrics extends Command
{
    protected $signature = 'direct-messages:metrics';

    protected $description = 'Print aggregate, role-oriented consultation conversion metrics without participant identities';

    public function handle(): int
    {
        $this->line(json_encode(app(\App\Services\DirectMessages\DirectMessageMetrics::class)->summarize(), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

        return self::SUCCESS;
    }
}
