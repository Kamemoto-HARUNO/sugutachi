<?php

namespace Tests\Feature;

use App\Models\LegalDocument;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LegalDocumentSyncCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_command_can_sync_default_legal_document_drafts(): void
    {
        config()->set('service_meta.name', 'すぐタチ');
        config()->set('service_meta.base_url', 'https://sugutachi.com');
        config()->set('service_meta.support_email', 'support@sugutachi.com');
        config()->set('service_meta.commerce.operator_name', '合同会社すぐタチ');
        config()->set('service_meta.commerce.representative_name', '亀本 春乃');
        config()->set('service_meta.commerce.business_address', '東京都渋谷区...');
        config()->set('service_meta.commerce.phone_number', '03-0000-0000');
        config()->set('service_meta.commerce.inquiry_hours', '平日 10:00-18:00');

        $this->artisan('legal-documents:sync-default-drafts')
            ->assertExitCode(0);

        $this->assertDatabaseCount('legal_documents', 3);
        $this->assertDatabaseHas('legal_documents', [
            'document_type' => 'terms',
            'version' => '2026-04-28',
            'title' => '利用規約',
        ]);

        $commerce = LegalDocument::query()
            ->where('document_type', 'commerce')
            ->where('version', '2026-04-28')
            ->firstOrFail();

        $this->assertStringContainsString('合同会社すぐタチ', $commerce->body);
        $this->assertStringContainsString('support@sugutachi.com', $commerce->body);
        $this->assertNull($commerce->published_at);

        $this->artisan('legal-documents:sync-default-drafts')
            ->assertExitCode(0);

        $this->assertDatabaseCount('legal_documents', 3);
    }

    public function test_sync_preserves_published_document_and_updates_only_drafts(): void
    {
        $this->artisan('legal-documents:sync-default-drafts')->assertExitCode(0);
        $terms = LegalDocument::query()->where('document_type', 'terms')->sole();
        $terms->update(['body' => '公開済みの本文', 'published_at' => now(), 'effective_at' => now()]);
        $published = $terms->fresh()->getRawOriginal();
        $commerce = LegalDocument::query()->where('document_type', 'commerce')->sole();
        $commerce->update(['body' => '古い草案']);

        $this->artisan('legal-documents:sync-default-drafts')->assertExitCode(0);

        $this->assertSame($published, $terms->fresh()->getRawOriginal());
        $this->assertNotSame('古い草案', $commerce->fresh()->body);
        $this->assertNull($commerce->fresh()->published_at);
        $this->assertDatabaseCount('legal_documents', 3);
    }
}
