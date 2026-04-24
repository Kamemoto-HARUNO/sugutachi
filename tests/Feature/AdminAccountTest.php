<?php

namespace Tests\Feature;

use App\Models\Account;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminAccountTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_and_show_accounts(): void
    {
        [$admin, $user] = $this->createAdminAccountFixture();
        $token = $admin->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/admin/accounts?status=active&role=user&q=Managed&sort=display_name&direction=asc')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $user->public_id)
            ->assertJsonFragment(['role' => 'user']);

        $this->withToken($token)
            ->getJson("/api/admin/accounts/{$user->public_id}")
            ->assertOk()
            ->assertJsonPath('data.public_id', $user->public_id)
            ->assertJsonPath('data.status', Account::STATUS_ACTIVE);
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

    public function test_non_admin_cannot_access_account_admin_api(): void
    {
        [, $user] = $this->createAdminAccountFixture();

        $this->withToken($user->createToken('api')->plainTextToken)
            ->getJson('/api/admin/accounts')
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
