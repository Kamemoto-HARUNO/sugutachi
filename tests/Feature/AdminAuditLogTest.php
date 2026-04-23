<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\AdminAuditLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminAuditLogTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_audit_logs_with_filters(): void
    {
        [$admin, $target] = $this->createAdminAuditFixture();

        AdminAuditLog::create([
            'actor_account_id' => $admin->id,
            'action' => 'account.suspend',
            'target_type' => Account::class,
            'target_id' => $target->id,
            'before_json' => ['status' => Account::STATUS_ACTIVE],
            'after_json' => ['status' => Account::STATUS_SUSPENDED],
            'created_at' => now(),
        ]);
        AdminAuditLog::create([
            'actor_account_id' => $admin->id,
            'action' => 'account.restore',
            'target_type' => Account::class,
            'target_id' => $target->id,
            'created_at' => now()->subMinute(),
        ]);

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->getJson("/api/admin/audit-logs?action=account.suspend&actor_account_id={$admin->public_id}&target_type=".urlencode(Account::class)."&target_id={$target->id}")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.actor_account.public_id', $admin->public_id)
            ->assertJsonPath('data.0.action', 'account.suspend')
            ->assertJsonPath('data.0.before.status', Account::STATUS_ACTIVE)
            ->assertJsonPath('data.0.after.status', Account::STATUS_SUSPENDED);
    }

    public function test_non_admin_cannot_access_audit_logs(): void
    {
        [, $target] = $this->createAdminAuditFixture();

        $this->withToken($target->createToken('api')->plainTextToken)
            ->getJson('/api/admin/audit-logs')
            ->assertForbidden();
    }

    private function createAdminAuditFixture(): array
    {
        $admin = Account::factory()->create(['public_id' => 'acc_admin_audit']);
        $admin->roleAssignments()->create([
            'role' => 'admin',
            'status' => 'active',
            'granted_at' => now(),
        ]);
        $target = Account::factory()->create(['public_id' => 'acc_audit_target']);

        return [$admin, $target];
    }
}
