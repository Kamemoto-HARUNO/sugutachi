<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Report;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Tests\TestCase;

class AdminReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_and_view_report_detail(): void
    {
        [$admin, $report, $reporter] = $this->createAdminReportFixture();
        Report::create([
            'public_id' => 'rep_admin_resolved',
            'reporter_account_id' => Account::factory()->create(['public_id' => 'acc_reporter_other'])->id,
            'target_account_id' => Account::factory()->create(['public_id' => 'acc_report_target_other'])->id,
            'category' => 'other',
            'severity' => Report::SEVERITY_LOW,
            'status' => Report::STATUS_RESOLVED,
            'resolved_at' => now(),
        ]);
        $token = $admin->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->getJson("/api/admin/reports?status=open&severity=high&reporter_account_id={$reporter->public_id}&sort=created_at&direction=asc")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $report->public_id)
            ->assertJsonPath('data.0.reporter_account_id', $reporter->public_id);

        $this->withToken($token)
            ->getJson("/api/admin/reports/{$report->public_id}")
            ->assertOk()
            ->assertJsonPath('data.public_id', $report->public_id)
            ->assertJsonPath('data.detail', 'The guest ignored the relaxation-only boundary.');

        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'report.view',
            'target_type' => Report::class,
            'target_id' => $report->id,
        ]);
    }

    public function test_admin_can_add_action_and_resolve_report(): void
    {
        [$admin, $report] = $this->createAdminReportFixture();
        $token = $admin->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->postJson("/api/admin/reports/{$report->public_id}/actions", [
                'action_type' => 'contacted_reporter',
                'note' => 'Asked the reporter for details.',
                'metadata' => ['channel' => 'email'],
            ])
            ->assertOk()
            ->assertJsonPath('data.assigned_admin.public_id', $admin->public_id)
            ->assertJsonPath('data.actions.0.action_type', 'contacted_reporter')
            ->assertJsonPath('data.actions.0.note', 'Asked the reporter for details.');

        $this->assertDatabaseHas('reports', [
            'id' => $report->id,
            'assigned_admin_account_id' => $admin->id,
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'report.action',
            'target_type' => Report::class,
            'target_id' => $report->id,
        ]);

        $this->withToken($token)
            ->postJson("/api/admin/reports/{$report->public_id}/resolve", [
                'resolution_note' => 'Closed after policy warning.',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', Report::STATUS_RESOLVED);

        $this->assertDatabaseHas('reports', [
            'id' => $report->id,
            'status' => Report::STATUS_RESOLVED,
            'assigned_admin_account_id' => $admin->id,
        ]);
        $this->assertDatabaseHas('report_actions', [
            'report_id' => $report->id,
            'admin_account_id' => $admin->id,
            'action_type' => 'report_resolved',
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'report.resolve',
            'target_type' => Report::class,
            'target_id' => $report->id,
        ]);
    }

    public function test_non_admin_cannot_access_report_admin_api(): void
    {
        [, $report, $reporter] = $this->createAdminReportFixture();

        $this->withToken($reporter->createToken('api')->plainTextToken)
            ->getJson("/api/admin/reports/{$report->public_id}")
            ->assertForbidden();
    }

    private function createAdminReportFixture(): array
    {
        $admin = Account::factory()->create(['public_id' => 'acc_admin_report']);
        $admin->roleAssignments()->create([
            'role' => 'admin',
            'status' => 'active',
            'granted_at' => now(),
        ]);
        $reporter = Account::factory()->create([
            'public_id' => 'acc_reporter_admin',
            'display_name' => 'Reporter',
        ]);
        $target = Account::factory()->create([
            'public_id' => 'acc_report_target_admin',
            'display_name' => 'Report Target',
        ]);

        $report = Report::create([
            'public_id' => 'rep_admin',
            'reporter_account_id' => $reporter->id,
            'target_account_id' => $target->id,
            'category' => 'boundary_violation',
            'severity' => Report::SEVERITY_HIGH,
            'detail_encrypted' => Crypt::encryptString('The guest ignored the relaxation-only boundary.'),
            'status' => Report::STATUS_OPEN,
        ]);

        return [$admin, $report, $reporter, $target];
    }
}
