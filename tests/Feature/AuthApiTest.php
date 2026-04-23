<?php

namespace Tests\Feature;

use App\Models\Account;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_account_can_register_read_self_and_logout(): void
    {
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
}
