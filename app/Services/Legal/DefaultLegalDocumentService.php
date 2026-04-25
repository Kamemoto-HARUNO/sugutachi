<?php

namespace App\Services\Legal;

use App\Models\LegalDocument;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class DefaultLegalDocumentService
{
    public function syncDraftTemplates(?array $documentTypes = null): array
    {
        $created = 0;
        $updated = 0;
        $skipped = 0;

        foreach ($this->templates($documentTypes) as $template) {
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
                'body' => $this->renderBody($template['body_template']),
                'published_at' => null,
                'effective_at' => null,
            ])->save();

            if ($document->wasRecentlyCreated) {
                $created++;

                continue;
            }

            $updated++;
        }

        return [
            'created' => $created,
            'updated' => $updated,
            'skipped' => $skipped,
        ];
    }

    public function ensurePublished(array $documentTypes): Collection
    {
        $resolvedTypes = array_values(array_unique($documentTypes));

        if ($resolvedTypes === []) {
            return collect();
        }

        $published = LegalDocument::latestPublishedByTypes($resolvedTypes);

        foreach ($this->templates($resolvedTypes) as $template) {
            if ($published->has($template['document_type'])) {
                continue;
            }

            $document = LegalDocument::query()->firstOrNew([
                'document_type' => $template['document_type'],
                'version' => $template['version'],
            ]);

            $document->forceFill([
                'public_id' => $document->public_id ?: 'ldoc_'.Str::ulid(),
                'title' => filled($document->title) ? $document->title : $template['title'],
                'body' => filled($document->body) ? $document->body : $this->renderBody($template['body_template']),
                'published_at' => now(),
                'effective_at' => now(),
            ])->save();

            $published->put($template['document_type'], $document->fresh());
        }

        return LegalDocument::latestPublishedByTypes($resolvedTypes);
    }

    private function templates(?array $documentTypes = null): Collection
    {
        return collect(config('legal_documents.draft_templates', []))
            ->filter(function (array $template) use ($documentTypes): bool {
                if ($documentTypes === null) {
                    return true;
                }

                return in_array($template['document_type'], $documentTypes, true);
            })
            ->values();
    }

    private function renderBody(string $bodyTemplate): string
    {
        return strtr($bodyTemplate, [
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
        ]);
    }
}
