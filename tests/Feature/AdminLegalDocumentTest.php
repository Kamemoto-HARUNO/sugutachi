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
            'public_id' => 'ldoc_terms_admin',
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
            ->assertJsonPath('data.0.public_id', $publishedDocument->public_id)
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
            ->assertJsonPath('data.public_id', fn (string $value) => str_starts_with($value, 'ldoc_'))
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

    public function test_creating_new_document_of_same_type_unpublishes_previous_version(): void
    {
        [$admin] = $this->createAdminFixture();
        $token = $admin->createToken('api')->plainTextToken;

        $publishedDocument = LegalDocument::create([
            'public_id' => 'ldoc_terms_existing',
            'document_type' => 'terms',
            'version' => '2026-04-01',
            'title' => '旧 利用規約',
            'body' => '公開済みの旧本文',
            'published_at' => now()->subDay(),
            'effective_at' => now()->subDay(),
        ]);

        $createdId = $this->withToken($token)
            ->postJson('/api/admin/legal-documents', [
                'document_type' => 'terms',
                'version' => '2026-05-01',
                'title' => '新 利用規約',
                'body' => '新しい本文',
            ])
            ->assertCreated()
            ->assertJsonPath('data.document_type', 'terms')
            ->json('data.id');

        $publishedDocument->refresh();

        $this->assertNull($publishedDocument->published_at);
        $this->assertDatabaseHas('legal_documents', [
            'id' => $createdId,
            'document_type' => 'terms',
        ]);
    }

    public function test_published_legal_document_cannot_be_updated(): void
    {
        [$admin] = $this->createAdminFixture();
        $document = LegalDocument::create([
            'public_id' => 'ldoc_terms_published_admin',
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

    public function test_document_can_only_be_deleted_when_consent_count_is_zero(): void
    {
        [$admin] = $this->createAdminFixture();
        $acceptedAccount = Account::factory()->create(['public_id' => 'acc_legal_delete_acceptor']);
        $token = $admin->createToken('api')->plainTextToken;

        $lockedDocument = LegalDocument::create([
            'public_id' => 'ldoc_terms_locked',
            'document_type' => 'terms',
            'version' => '2026-04-01',
            'title' => '削除不可 利用規約',
            'body' => '公開済み本文',
            'published_at' => now()->subHour(),
            'effective_at' => now(),
        ]);

        LegalAcceptance::create([
            'account_id' => $acceptedAccount->id,
            'legal_document_id' => $lockedDocument->id,
            'accepted_at' => now(),
        ]);

        $deletableDocument = LegalDocument::create([
            'public_id' => 'ldoc_terms_deletable',
            'document_type' => 'privacy',
            'version' => '2026-05-01',
            'title' => '削除可能 プライバシーポリシー',
            'body' => 'ドラフト本文',
            'published_at' => null,
            'effective_at' => null,
        ]);

        $this->withToken($token)
            ->deleteJson("/api/admin/legal-documents/{$lockedDocument->id}")
            ->assertConflict();

        $this->withToken($token)
            ->deleteJson("/api/admin/legal-documents/{$deletableDocument->id}")
            ->assertOk()
            ->assertJsonPath('message', '法務文書を削除しました。');

        $this->assertDatabaseHas('legal_documents', [
            'id' => $lockedDocument->id,
        ]);

        $this->assertDatabaseMissing('legal_documents', [
            'id' => $deletableDocument->id,
        ]);

        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'legal_document.delete',
            'target_type' => LegalDocument::class,
            'target_id' => $deletableDocument->id,
        ]);
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
