<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\LegalAcceptance;
use App\Models\LegalDocument;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminLegalDocumentTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_create_and_update_draft_legal_documents(): void
    {
        [$admin] = $this->createAdminFixture();
        $acceptedAccount = Account::factory()->create(['public_id' => 'acc_legal_acceptor']);
        $token = $admin->createToken('api')->plainTextToken;

        $publishedDocument = LegalDocument::create([
            'document_type' => 'terms',
            'version' => '2026-04-01',
            'title' => '利用規約',
            'body' => '公開済みの利用規約本文',
            'published_at' => now()->subDay(),
            'effective_at' => now(),
        ]);
        LegalAcceptance::create([
            'account_id' => $acceptedAccount->id,
            'legal_document_id' => $publishedDocument->id,
            'accepted_at' => now(),
        ]);

        $this->withToken($token)
            ->getJson('/api/admin/legal-documents?document_type=terms&is_published=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $publishedDocument->id)
            ->assertJsonPath('data.0.acceptances_count', 1)
            ->assertJsonPath('data.0.is_published', true);

        $createResponse = $this->withToken($token)
            ->postJson('/api/admin/legal-documents', [
                'document_type' => 'privacy',
                'version' => '2026-05-01',
                'title' => 'プライバシーポリシー',
                'body' => '改定予定のプライバシーポリシー本文',
                'effective_at' => '2026-05-15T00:00:00+09:00',
            ])
            ->assertCreated()
            ->assertJsonPath('data.document_type', 'privacy')
            ->assertJsonPath('data.version', '2026-05-01')
            ->assertJsonPath('data.is_published', false);

        $draftId = $createResponse->json('data.id');

        $this->withToken($token)
            ->patchJson("/api/admin/legal-documents/{$draftId}", [
                'title' => 'プライバシーポリシー改定案',
                'published_at' => '2026-05-10T00:00:00+09:00',
                'effective_at' => '2026-05-15T00:00:00+09:00',
            ])
            ->assertOk()
            ->assertJsonPath('data.title', 'プライバシーポリシー改定案')
            ->assertJsonPath('data.is_published', true);

        $draft = LegalDocument::query()->findOrFail($draftId);
        $this->assertSame('プライバシーポリシー改定案', $draft->title);
        $this->assertNotNull($draft->published_at);

        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'legal_document.create',
            'target_type' => LegalDocument::class,
            'target_id' => $draftId,
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'legal_document.update',
            'target_type' => LegalDocument::class,
            'target_id' => $draftId,
        ]);
    }

    public function test_published_legal_document_cannot_be_updated(): void
    {
        [$admin] = $this->createAdminFixture();
        $document = LegalDocument::create([
            'document_type' => 'terms',
            'version' => '2026-04-01',
            'title' => '利用規約',
            'body' => '公開済み本文',
            'published_at' => now()->subHour(),
            'effective_at' => now(),
        ]);

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->patchJson("/api/admin/legal-documents/{$document->id}", [
                'title' => '変更しようとした本文',
            ])
            ->assertConflict();
    }

    public function test_non_admin_cannot_access_legal_document_admin_api(): void
    {
        [, $user] = $this->createAdminFixture();

        $this->withToken($user->createToken('api')->plainTextToken)
            ->getJson('/api/admin/legal-documents')
            ->assertForbidden();
    }

    private function createAdminFixture(): array
    {
        $admin = Account::factory()->create(['public_id' => 'acc_admin_legal_docs']);
        $admin->roleAssignments()->create([
            'role' => 'admin',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        $user = Account::factory()->create(['public_id' => 'acc_regular_legal_docs']);
        $user->roleAssignments()->create([
            'role' => 'user',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        return [$admin, $user];
    }
}
