<?php

use App\Models\TherapistLedgerEntry;
use Illuminate\Console\Command;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('ledger:release-available', function (): int {
    $released = TherapistLedgerEntry::query()
        ->where('status', TherapistLedgerEntry::STATUS_PENDING)
        ->whereNotNull('available_at')
        ->where('available_at', '<=', now())
        ->update([
            'status' => TherapistLedgerEntry::STATUS_AVAILABLE,
            'updated_at' => now(),
        ]);

    $this->info("Released {$released} therapist ledger entries.");

    return Command::SUCCESS;
})->purpose('Release matured therapist ledger entries to available balance');
