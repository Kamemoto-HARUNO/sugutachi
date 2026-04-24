<?php

use App\Models\LegalDocument;
use App\Models\TherapistLedgerEntry;
use Illuminate\Console\Command;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Str;

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

Artisan::command('legal-documents:sync-default-drafts', function (): int {
    $replacements = [
        '{{service_name}}' => (string) config('service_meta.name', 'すぐタチ'),
        '{{service_url}}' => (string) config('service_meta.base_url', config('app.url')),
        '{{support_email}}' => (string) config('service_meta.support_email', 'support@example.com'),
        '{{operator_name}}' => (string) (config('service_meta.commerce.operator_name') ?: '未設定'),
        '{{representative_name}}' => (string) (config('service_meta.commerce.representative_name') ?: '未設定'),
        '{{business_address}}' => (string) (config('service_meta.commerce.business_address') ?: '未設定'),
        '{{phone_number}}' => (string) (config('service_meta.commerce.phone_number') ?: '未設定'),
        '{{inquiry_hours}}' => (string) (config('service_meta.commerce.inquiry_hours') ?: '未設定'),
        '{{payment_timing}}' => (string) config('service_meta.commerce.payment_timing'),
        '{{service_delivery_timing}}' => (string) config('service_meta.commerce.service_delivery_timing'),
        '{{cancellation_policy_summary}}' => (string) config('service_meta.commerce.cancellation_policy_summary'),
        '{{refund_policy_summary}}' => (string) config('service_meta.commerce.refund_policy_summary'),
    ];

    $created = 0;
    $updated = 0;
    $skipped = 0;

    foreach (config('legal_documents.draft_templates', []) as $template) {
        $document = LegalDocument::query()->firstOrNew([
            'document_type' => $template['document_type'],
            'version' => $template['version'],
        ]);

        if ($document->exists && $document->published_at !== null) {
            $skipped++;

            continue;
        }

        $document->forceFill([
            'public_id' => $document->public_id ?: 'ldoc_'.Str::ulid(),
            'title' => $template['title'],
            'body' => strtr($template['body_template'], $replacements),
            'published_at' => null,
            'effective_at' => null,
        ])->save();

        if ($document->wasRecentlyCreated) {
            $created++;

            continue;
        }

        $updated++;
    }

    $this->info("Synced default legal document drafts. created={$created} updated={$updated} skipped={$skipped}");

    return Command::SUCCESS;
})->purpose('Create or update default draft legal document templates from current service settings');
