<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\LegalDocument;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LegalDocumentApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_can_list_latest_published_legal_documents_and_fetch_latest_by_type(): void
    {
        LegalDocument::create([
            'public_id' => 'ldoc_terms_old',
            'document_type' => 'terms',
            'version' => '2026-04-01',
            'title' => '利用規約 旧版',
            'body' => '利用規約旧版本文',
            'published_at' => now()->subDays(10),
            'effective_at' => now()->subDays(9),
        ]);
        LegalDocument::create([
            'public_id' => 'ldoc_terms_new',
            'document_type' => 'terms',
            'version' => '2026-05-01',
            'title' => '利用規約 最新版',
            'body' => '利用規約最新版本文',
            'published_at' => now()->subDay(),
            'effective_at' => now(),
        ]);
        LegalDocument::create([
            'public_id' => 'ldoc_privacy',
            'document_type' => 'privacy',
            'version' => '2026-05-01',
            'title' => 'プライバシーポリシー',
            'body' => 'プライバシーポリシー本文',
            'published_at' => now()->subDay(),
            'effective_at' => now(),
        ]);
        LegalDocument::create([
            'public_id' => 'ldoc_privacy_draft',
            'document_type' => 'privacy',
            'version' => '2026-06-01',
            'title' => 'プライバシーポリシー改定案',
            'body' => '改定案本文',
            'published_at' => null,
            'effective_at' => now()->addDays(5),
        ]);

        $this->getJson('/api/legal-documents')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.document_type', 'privacy')
            ->assertJsonPath('data.0.public_id', 'ldoc_privacy')
            ->assertJsonPath('data.0.path', '/api/legal-documents/privacy')
            ->assertJsonPath('data.0.accept_path', '/api/legal-documents/ldoc_privacy/accept')
            ->assertJsonPath('data.1.document_type', 'terms')
            ->assertJsonPath('data.1.public_id', 'ldoc_terms_new');

        $this->getJson('/api/legal-documents/terms')
            ->assertOk()
            ->assertJsonPath('data.public_id', 'ldoc_terms_new')
            ->assertJsonPath('data.version', '2026-05-01')
            ->assertJsonPath('data.title', '利用規約 最新版')
            ->assertJsonPath('data.path', '/api/legal-documents/terms')
            ->assertJsonPath('data.accept_path', '/api/legal-documents/ldoc_terms_new/accept');
    }

    public function test_authenticated_user_can_accept_published_legal_document_idempotently(): void
    {
        $account = Account::factory()->create(['public_id' => 'acc_legal_accept_user']);
        $token = $account->createToken('api')->plainTextToken;
        $document = LegalDocument::create([
            'public_id' => 'ldoc_therapist_terms',
            'document_type' => 'therapist_terms',
            'version' => '2026-05-01',
            'title' => 'タチキャスト規約',
            'body' => 'タチキャスト規約本文',
            'published_at' => now()->subDay(),
            'effective_at' => now(),
        ]);

        $this->withToken($token)
            ->postJson("/api/legal-documents/{$document->public_id}/accept")
            ->assertCreated()
            ->assertJsonPath('data.legal_document.public_id', $document->public_id)
            ->assertJsonPath('data.legal_document.document_type', 'therapist_terms');

        $this->assertDatabaseHas('legal_acceptances', [
            'account_id' => $account->id,
            'legal_document_id' => $document->id,
        ]);

        $this->withToken($token)
            ->postJson("/api/legal-documents/{$document->public_id}/accept")
            ->assertOk()
            ->assertJsonPath('data.legal_document.version', '2026-05-01');

        $this->assertDatabaseCount('legal_acceptances', 1);
    }

    public function test_guest_can_get_bootstrapped_default_registration_documents_when_missing(): void
    {
        $response = $this->getJson('/api/legal-documents')
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $documents = collect($response->json('data'))->keyBy('document_type');

        $this->assertSame('terms', $documents['terms']['document_type']);
        $this->assertSame('privacy', $documents['privacy']['document_type']);
        $this->assertNotNull(LegalDocument::query()->where('document_type', 'terms')->first()?->published_at);
        $this->assertNotNull(LegalDocument::query()->where('document_type', 'privacy')->first()?->published_at);

        $this->getJson('/api/legal-documents/terms')
            ->assertOk()
            ->assertJsonPath('data.document_type', 'terms');

        $this->getJson('/api/legal-documents/privacy')
            ->assertOk()
            ->assertJsonPath('data.document_type', 'privacy');
    }
}
