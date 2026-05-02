<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\IdentityVerification;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminAccountTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_and_show_accounts(): void
    {
        [$admin, $user] = $this->createAdminAccountFixture();
        $verification = IdentityVerification::create([
            'account_id' => $user->id,
            'provider' => 'manual',
            'status' => IdentityVerification::STATUS_APPROVED,
            'full_name_encrypted' => Crypt::encryptString('Managed User'),
            'birthdate_encrypted' => Crypt::encryptString('1990-01-01'),
            'birth_year' => 1990,
            'is_age_verified' => true,
            'self_declared_male' => true,
            'document_type' => 'driver_license',
            'document_last4_hash' => hash('sha256', '1234'),
            'document_storage_key_encrypted' => Crypt::encryptString('identity-verifications/document.png'),
            'selfie_storage_key_encrypted' => Crypt::encryptString('identity-verifications/selfie.png'),
            'submitted_at' => now()->subDay(),
            'reviewed_by_account_id' => $admin->id,
            'reviewed_at' => now()->subHours(12),
            'rejection_reason_code' => null,
            'purge_after' => now()->addDays(30),
        ]);
        $token = $admin->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/admin/accounts?status=active&role=user&q=Managed&sort=display_name&direction=asc')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $user->public_id)
            ->assertJsonFragment(['role' => 'user']);

        $response = $this->withToken($token)
            ->getJson("/api/admin/accounts/{$user->public_id}")
            ->assertOk()
            ->assertJsonPath('data.public_id', $user->public_id)
            ->assertJsonPath('data.status', Account::STATUS_ACTIVE)
            ->assertJsonPath('data.latest_identity_verification.status', IdentityVerification::STATUS_APPROVED)
            ->assertJsonPath('data.latest_identity_verification.document_type', 'driver_license')
            ->assertJsonPath('data.latest_identity_verification.reviewed_by.public_id', $admin->public_id);

        $this->assertStringContainsString(
            "/api/admin/identity-verifications/{$verification->id}/signed-document",
            (string) $response->json('data.latest_identity_verification.document_file_url')
        );
        $this->assertStringContainsString(
            "/api/admin/identity-verifications/{$verification->id}/signed-selfie",
            (string) $response->json('data.latest_identity_verification.selfie_file_url')
        );
    }

    public function test_admin_can_suspend_and_restore_account(): void
    {
        [$admin, $user] = $this->createAdminAccountFixture();
        $user->createToken('target-session');

        $this->assertDatabaseHas('personal_access_tokens', [
            'tokenable_id' => $user->id,
            'tokenable_type' => Account::class,
        ]);

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->postJson("/api/admin/accounts/{$user->public_id}/suspend", [
                'reason_code' => 'policy_violation',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', Account::STATUS_SUSPENDED)
            ->assertJsonPath('data.suspension_reason', 'policy_violation')
            ->assertJsonPath('data.therapist_profile.is_online', false);

        $this->assertDatabaseHas('accounts', [
            'id' => $user->id,
            'status' => Account::STATUS_SUSPENDED,
            'suspension_reason' => 'policy_violation',
        ]);
        $this->assertDatabaseHas('therapist_profiles', [
            'account_id' => $user->id,
            'profile_status' => 'approved',
            'is_online' => false,
        ]);
        $this->assertDatabaseMissing('personal_access_tokens', [
            'tokenable_id' => $user->id,
            'tokenable_type' => Account::class,
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'account.suspend',
            'target_type' => Account::class,
            'target_id' => $user->id,
        ]);

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->postJson("/api/admin/accounts/{$user->public_id}/restore")
            ->assertOk()
            ->assertJsonPath('data.status', Account::STATUS_ACTIVE)
            ->assertJsonPath('data.suspension_reason', null)
            ->assertJsonPath('data.therapist_profile.is_online', false);

        $this->assertDatabaseHas('accounts', [
            'id' => $user->id,
            'status' => Account::STATUS_ACTIVE,
            'suspension_reason' => null,
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'account.restore',
            'target_type' => Account::class,
            'target_id' => $user->id,
        ]);
    }

    public function test_admin_can_grant_admin_role_to_account(): void
    {
        [$admin, $user] = $this->createAdminAccountFixture();

        $this->assertDatabaseMissing('account_roles', [
            'account_id' => $user->id,
            'role' => 'admin',
        ]);

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->postJson("/api/admin/accounts/{$user->public_id}/grant-admin")
            ->assertOk()
            ->assertJsonPath('data.public_id', $user->public_id)
            ->assertJsonFragment([
                'role' => 'admin',
                'status' => 'active',
            ]);

        $this->assertDatabaseHas('account_roles', [
            'account_id' => $user->id,
            'role' => 'admin',
            'status' => 'active',
            'revoked_at' => null,
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'account.grant_admin',
            'target_type' => Account::class,
            'target_id' => $user->id,
        ]);
    }

    public function test_non_admin_cannot_access_account_admin_api(): void
    {
        [, $user] = $this->createAdminAccountFixture();

        $this->withToken($user->createToken('api')->plainTextToken)
            ->getJson('/api/admin/accounts')
            ->assertForbidden();

        $this->withToken($user->createToken('api-grant')->plainTextToken)
            ->postJson("/api/admin/accounts/{$user->public_id}/grant-admin")
            ->assertForbidden();
    }

    public function test_admin_cannot_suspend_self(): void
    {
        [$admin] = $this->createAdminAccountFixture();

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->postJson("/api/admin/accounts/{$admin->public_id}/suspend", [
                'reason_code' => 'self_suspend',
            ])
            ->assertConflict();
    }

    private function createAdminAccountFixture(): array
    {
        $admin = Account::factory()->create(['public_id' => 'acc_admin_accounts']);
        $admin->roleAssignments()->create([
            'role' => 'admin',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        $user = Account::factory()->create([
            'public_id' => 'acc_managed_user',
            'display_name' => 'Managed User',
            'status' => Account::STATUS_ACTIVE,
            'last_active_role' => 'user',
        ]);
        $user->roleAssignments()->create([
            'role' => 'user',
            'status' => 'active',
            'granted_at' => now(),
        ]);
        $user->roleAssignments()->create([
            'role' => 'therapist',
            'status' => 'active',
            'granted_at' => now(),
        ]);
        $user->therapistProfile()->create([
            'public_id' => 'thp_managed_user',
            'public_name' => 'Managed Therapist',
            'profile_status' => 'approved',
            'training_status' => 'completed',
            'is_online' => true,
            'online_since' => now()->subMinutes(5),
        ]);

        return [$admin, $user];
    }
}
