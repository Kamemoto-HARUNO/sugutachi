<?php

use App\Models\TherapistLedgerEntry;
use App\Models\IdentityVerification;
use App\Services\Bookings\BookingCompletionFollowupService;
use App\Services\Bookings\BookingRequestExpirationService;
use App\Services\Legal\DefaultLegalDocumentService;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Storage;
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

Artisan::command('bookings:expire-pending-requests', function (BookingRequestExpirationService $service): int {
    $result = $service->expireDueScheduledRequests();

    $this->info("Expired {$result['expired']} scheduled booking requests. failed={$result['failed']}");

    return $result['failed'] > 0 ? Command::FAILURE : Command::SUCCESS;
})->purpose('Expire due scheduled booking requests and release their payment authorization');

Artisan::command('bookings:follow-up-completion-confirmations', function (BookingCompletionFollowupService $service): int {
    $result = $service->processPendingConfirmations();

    $this->info("Processed booking completion follow-ups. reminded={$result['reminded']} auto_completed={$result['auto_completed']}");

    return Command::SUCCESS;
})->purpose('Send completion reminders and auto-complete due therapist-completed bookings');

Artisan::command('legal-documents:sync-default-drafts', function (DefaultLegalDocumentService $defaultLegalDocumentService): int {
    $result = $defaultLegalDocumentService->syncDraftTemplates();

    $this->info("Synced default legal document drafts. created={$result['created']} updated={$result['updated']} skipped={$result['skipped']}");

    return Command::SUCCESS;
})->purpose('Create or update default draft legal document templates from current service settings');

Artisan::command('identity-verifications:purge-files', function (): int {
    $purged = 0;

    IdentityVerification::query()
        ->whereNotNull('purge_after')
        ->where('purge_after', '<=', now())
        ->where(function ($query): void {
            $query
                ->whereNotNull('document_storage_key_encrypted')
                ->orWhereNotNull('selfie_storage_key_encrypted');
        })
        ->orderBy('id')
        ->chunkById(100, function ($verifications) use (&$purged): void {
            foreach ($verifications as $verification) {
                foreach (['document_storage_key_encrypted', 'selfie_storage_key_encrypted'] as $attribute) {
                    $encryptedPath = $verification->{$attribute};

                    if (! is_string($encryptedPath) || $encryptedPath === '') {
                        continue;
                    }

                    $path = rescue(fn () => Crypt::decryptString($encryptedPath), null, false);

                    if (is_string($path) && $path !== '') {
                        Storage::disk('local')->delete($path);
                    }

                    $verification->{$attribute} = null;
                }

                $verification->save();
                $purged++;
            }
        });

    $this->info("Purged identity verification files for {$purged} records.");

    return Command::SUCCESS;
})->purpose('Delete expired identity verification document and selfie files');
