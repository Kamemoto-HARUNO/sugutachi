<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\LegalDocument;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Tests\TestCase;

class AuthApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_account_can_register_read_self_and_logout(): void
    {
        $this->seedPublishedRegistrationDocuments();

        $registerResponse = $this->postJson('/api/auth/register', [
            'email' => 'user@example.test',
            'password' => 'very-secure-password',
            'password_confirmation' => 'very-secure-password',
            'display_name' => 'Test User',
            'accepted_terms_version' => '2026-04-01',
            'accepted_privacy_version' => '2026-04-01',
            'is_over_18' => true,
            'relaxation_purpose_agreed' => true,
        ]);

        $registerResponse
            ->assertCreated()
            ->assertJsonPath('token_type', 'Bearer')
            ->assertJsonPath('account.email', 'user@example.test')
            ->assertJsonPath('account.roles.0.role', 'user');

        $token = $registerResponse->json('access_token');

        $this->assertDatabaseHas('accounts', [
            'email' => 'user@example.test',
            'status' => 'active',
            'last_active_role' => 'user',
        ]);
        $this->assertDatabaseHas('legal_acceptances', [
            'account_id' => Account::query()->where('email', 'user@example.test')->value('id'),
        ]);

        $this->assertDatabaseHas('personal_access_tokens', [
            'name' => 'api',
        ]);

        $this->withToken($token)
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('data.email', 'user@example.test');

        $this->withToken($token)
            ->postJson('/api/auth/logout')
            ->assertNoContent();

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_account_can_login_with_email_and_password(): void
    {
        Account::factory()->create([
            'email' => 'existing@example.test',
            'password' => 'very-secure-password',
        ]);

        $this->postJson('/api/auth/login', [
            'email' => 'existing@example.test',
            'password' => 'very-secure-password',
        ])
            ->assertOk()
            ->assertJsonPath('token_type', 'Bearer')
            ->assertJsonPath('account.email', 'existing@example.test');
    }

    public function test_account_can_reset_password_with_valid_token(): void
    {
        $account = Account::factory()->create([
            'email' => 'reset-me@example.test',
            'password' => 'very-secure-password',
        ]);

        $token = Password::broker()->createToken($account);

        $this->postJson('/api/auth/reset-password', [
            'token' => $token,
            'email' => 'reset-me@example.test',
            'password' => 'new-secure-password',
            'password_confirmation' => 'new-secure-password',
        ])
            ->assertOk()
            ->assertJsonPath('status', 'password_reset');

        $this->assertTrue(Hash::check('new-secure-password', $account->fresh()->password));
    }

    public function test_account_can_register_after_default_registration_documents_are_bootstrapped(): void
    {
        $documents = collect(
            $this->getJson('/api/legal-documents')
                ->assertOk()
                ->json('data')
        )->keyBy('document_type');

        $registerResponse = $this->postJson('/api/auth/register', [
            'email' => 'bootstrapped@example.test',
            'password' => 'very-secure-password',
            'password_confirmation' => 'very-secure-password',
            'display_name' => 'Bootstrapped User',
            'accepted_terms_version' => $documents['terms']['version'],
            'accepted_privacy_version' => $documents['privacy']['version'],
            'is_over_18' => true,
            'relaxation_purpose_agreed' => true,
        ]);

        $registerResponse
            ->assertCreated()
            ->assertJsonPath('account.email', 'bootstrapped@example.test')
            ->assertJsonPath('account.roles.0.role', 'user');

        $this->assertDatabaseHas('legal_documents', [
            'document_type' => 'terms',
            'version' => $documents['terms']['version'],
        ]);
        $this->assertDatabaseHas('legal_documents', [
            'document_type' => 'privacy',
            'version' => $documents['privacy']['version'],
        ]);
    }

    public function test_register_requires_published_terms_and_privacy_versions(): void
    {
        $this->postJson('/api/auth/register', [
            'email' => 'invalid@example.test',
            'password' => 'very-secure-password',
            'password_confirmation' => 'very-secure-password',
            'display_name' => 'Invalid User',
            'accepted_terms_version' => '2026-04-01',
            'accepted_privacy_version' => '2026-04-01',
            'is_over_18' => true,
            'relaxation_purpose_agreed' => true,
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['accepted_terms_version', 'accepted_privacy_version']);
    }

    private function seedPublishedRegistrationDocuments(): void
    {
        LegalDocument::create([
            'public_id' => 'ldoc_terms_register',
            'document_type' => 'terms',
            'version' => '2026-04-01',
            'title' => '利用規約',
            'body' => '利用規約本文',
            'published_at' => now()->subDay(),
            'effective_at' => now(),
        ]);
        LegalDocument::create([
            'public_id' => 'ldoc_privacy_register',
            'document_type' => 'privacy',
            'version' => '2026-04-01',
            'title' => 'プライバシーポリシー',
            'body' => 'プライバシーポリシー本文',
            'published_at' => now()->subDay(),
            'effective_at' => now(),
        ]);
    }
}
