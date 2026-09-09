<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\AppNotification;
use App\Models\IdentityVerification;
use App\Models\SupportStepDelivery;
use App\Models\SupportStepScenario;
use App\Models\SupportTicket;
use App\Services\Support\SupportStepDeliveryService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class SupportStepScenarioTest extends TestCase
{
    use RefreshDatabase;

    public static function scheduledTimes(): array
    {
        return [
            'midnight short' => ['00:00'],
            'morning short' => ['09:05'],
            'evening full' => ['20:00:00'],
            'end of day full' => ['23:59:00'],
        ];
    }

    #[DataProvider('scheduledTimes')]
    public function test_scheduled_delivery_matches_only_its_minute_and_does_not_resend(string $sendTime): void
    {
        Mail::fake();
        $dueAt = CarbonImmutable::parse('2026-05-12 '.$sendTime, 'Asia/Tokyo');
        $this->travelTo($dueAt);
        $admin = $this->accountWithRole('admin');
        $user = $this->accountWithRole('user', ['created_at' => $dueAt->subDays(2)]);
        $scenario = $this->scenario($admin, ['send_time' => $sendTime]);
        $this->scenario($admin, ['send_time' => $sendTime, 'status' => SupportStepScenario::STATUS_DRAFT]);
        $service = app(SupportStepDeliveryService::class);

        $this->assertSame(['sent' => 0, 'skipped' => 0, 'failed' => 0], $service->processDueScenarios($dueAt->subMinute()));
        $this->assertSame(['sent' => 1, 'skipped' => 0, 'failed' => 0], $service->processDueScenarios($dueAt->addSeconds(45)));
        $this->assertSame(['sent' => 0, 'skipped' => 1, 'failed' => 0], $service->processDueScenarios($dueAt->addSeconds(50)));
        $this->assertSame(['sent' => 0, 'skipped' => 0, 'failed' => 0], $service->processDueScenarios($dueAt->addMinute()));
        $this->assertDatabaseCount('support_tickets', 1);
        $this->assertDatabaseHas('support_step_deliveries', [
            'support_step_scenario_id' => $scenario->id,
            'account_id' => $user->id,
            'status' => SupportStepDelivery::STATUS_SENT,
        ]);
        $sent = SupportStepDelivery::query()->where('status', SupportStepDelivery::STATUS_SENT)->sole();
        $this->assertSame('2026-05-12', $sent->scheduled_for_date->toDateString());
    }

    public function test_admin_can_manage_support_step_scenario_preview_and_test_send(): void
    {
        Mail::fake();
        $admin = $this->accountWithRole('admin');
        $user = $this->accountWithRole('user', ['created_at' => now()->subDays(2)]);
        $this->accountWithRole('user', ['created_at' => now()]);

        Sanctum::actingAs($admin);
        $scenarioId = $this->postJson('/api/admin/support-step-scenarios', [
            'name' => '本人確認のご案内',
            'status' => SupportStepScenario::STATUS_ACTIVE,
            'target_role' => SupportStepScenario::TARGET_USER,
            'identity_verification_status' => SupportStepScenario::IDENTITY_UNVERIFIED,
            'elapsed_days' => 1,
            'send_time' => '20:00',
            'priority' => 100,
            'ticket_title' => '本人確認のご案内',
            'ticket_category' => 'account',
            'message_body' => '{user_name}さん、本人確認をお願いします。{verification_url}',
            'internal_notes' => '初回案内',
        ])
            ->assertCreated()
            ->assertJsonPath('data.name', '本人確認のご案内')
            ->assertJsonPath('data.send_time', '20:00')
            ->json('data.public_id');

        $this->getJson("/api/admin/support-step-scenarios/{$scenarioId}/preview")
            ->assertOk()
            ->assertJsonPath('data.condition_match_count', 1)
            ->assertJsonPath('data.sendable_count', 1);

        $this->postJson("/api/admin/support-step-scenarios/{$scenarioId}/test-send")
            ->assertCreated()
            ->assertJsonPath('data.delivery_type', SupportStepDelivery::TYPE_TEST)
            ->assertJsonPath('data.status', SupportStepDelivery::STATUS_SENT);

        $this->assertDatabaseHas('support_step_deliveries', [
            'support_step_scenario_id' => SupportStepScenario::query()->where('public_id', $scenarioId)->value('id'),
            'account_id' => $admin->id,
            'delivery_type' => SupportStepDelivery::TYPE_TEST,
            'status' => SupportStepDelivery::STATUS_SENT,
        ]);
        $this->assertDatabaseHas('support_tickets', [
            'account_id' => $admin->id,
            'title' => '本人確認のご案内',
            'status' => SupportTicket::STATUS_OPEN,
        ]);
        $this->assertDatabaseMissing('support_step_deliveries', [
            'account_id' => $user->id,
            'delivery_type' => SupportStepDelivery::TYPE_TEST,
        ]);
    }

    public function test_due_scenarios_send_one_message_per_user_per_day_by_priority(): void
    {
        Mail::fake();
        $admin = $this->accountWithRole('admin');
        $user = $this->accountWithRole('user', ['created_at' => CarbonImmutable::parse('2026-05-10 12:00:00', 'Asia/Tokyo')]);
        $now = CarbonImmutable::parse('2026-05-12 20:00:00', 'Asia/Tokyo');

        $high = $this->scenario($admin, [
            'name' => '高優先度',
            'priority' => 10,
            'ticket_title' => '高優先度タイトル',
        ]);
        $low = $this->scenario($admin, [
            'name' => '低優先度',
            'priority' => 100,
            'ticket_title' => '低優先度タイトル',
        ]);

        $result = app(SupportStepDeliveryService::class)->processDueScenarios($now);

        $this->assertSame(['sent' => 1, 'skipped' => 1, 'failed' => 0], $result);
        $this->assertDatabaseHas('support_step_deliveries', [
            'support_step_scenario_id' => $high->id,
            'account_id' => $user->id,
            'status' => SupportStepDelivery::STATUS_SENT,
        ]);
        $this->assertDatabaseHas('support_step_deliveries', [
            'support_step_scenario_id' => $low->id,
            'account_id' => $user->id,
            'status' => SupportStepDelivery::STATUS_SKIPPED,
            'skip_reason' => SupportStepDelivery::SKIP_DAILY_LIMIT,
        ]);
        $this->assertDatabaseCount('support_tickets', 1);
        $this->assertDatabaseHas('notifications', [
            'account_id' => $user->id,
            'notification_type' => 'support_ticket_created',
            'status' => AppNotification::STATUS_SENT,
        ]);
    }

    public function test_existing_same_title_ticket_is_excluded_from_delivery(): void
    {
        Mail::fake();
        $admin = $this->accountWithRole('admin');
        $user = $this->accountWithRole('user', ['created_at' => CarbonImmutable::parse('2026-05-10 12:00:00', 'Asia/Tokyo')]);
        $ticket = SupportTicket::create([
            'public_id' => 'sup_existing',
            'account_id' => $user->id,
            'requester_role' => 'user',
            'origin' => SupportTicket::ORIGIN_ADMIN,
            'title' => '本人確認のご案内',
            'category' => 'account',
            'status' => SupportTicket::STATUS_COMPLETED,
            'created_by_account_id' => $admin->id,
            'completed_by_admin_account_id' => $admin->id,
            'completed_at' => now(),
            'last_message_at' => now()->subDay(),
        ]);
        $scenario = $this->scenario($admin, ['ticket_title' => '本人確認のご案内']);

        Sanctum::actingAs($admin);
        $this->getJson("/api/admin/support-step-scenarios/{$scenario->public_id}/preview")
            ->assertOk()
            ->assertJsonPath('data.condition_match_count', 1)
            ->assertJsonPath('data.sendable_count', 0);

        $result = app(SupportStepDeliveryService::class)->processDueScenarios(CarbonImmutable::parse('2026-05-12 20:00:00', 'Asia/Tokyo'));

        $this->assertSame(['sent' => 0, 'skipped' => 1, 'failed' => 0], $result);
        $this->assertSame(SupportTicket::STATUS_COMPLETED, $ticket->refresh()->status);
        $this->assertNotNull($ticket->completed_at);
        $this->assertDatabaseHas('support_step_deliveries', [
            'support_step_scenario_id' => $scenario->id,
            'support_ticket_id' => null,
            'status' => SupportStepDelivery::STATUS_SKIPPED,
            'skip_reason' => SupportStepDelivery::SKIP_EXISTING_TICKET_TITLE,
        ]);
        $this->assertSame(1, SupportTicket::query()->count());
        $this->assertSame(0, $ticket->messages()->count());
    }

    public function test_scenarios_with_delivery_history_are_archived_instead_of_deleted(): void
    {
        $admin = $this->accountWithRole('admin');
        $scenario = $this->scenario($admin);
        SupportStepDelivery::create([
            'support_step_scenario_id' => $scenario->id,
            'account_id' => $admin->id,
            'requester_role' => 'user',
            'delivery_type' => SupportStepDelivery::TYPE_TEST,
            'status' => SupportStepDelivery::STATUS_SENT,
            'scheduled_for_date' => now('Asia/Tokyo')->toDateString(),
            'attempted_at' => now(),
            'sent_at' => now(),
        ]);

        Sanctum::actingAs($admin);
        $this->deleteJson("/api/admin/support-step-scenarios/{$scenario->public_id}")
            ->assertStatus(409);

        $this->postJson("/api/admin/support-step-scenarios/{$scenario->public_id}/archive")
            ->assertOk()
            ->assertJsonPath('data.status', SupportStepScenario::STATUS_ARCHIVED);
    }

    public function test_approved_identity_condition_matches_latest_approved_verification(): void
    {
        Mail::fake();
        $admin = $this->accountWithRole('admin');
        $user = $this->accountWithRole('therapist', ['created_at' => CarbonImmutable::parse('2026-05-08 12:00:00', 'Asia/Tokyo')]);
        IdentityVerification::create([
            'account_id' => $user->id,
            'provider' => 'manual',
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);
        $scenario = $this->scenario($admin, [
            'target_role' => SupportStepScenario::TARGET_THERAPIST,
            'identity_verification_status' => SupportStepScenario::IDENTITY_APPROVED,
            'elapsed_days' => 3,
        ]);

        $result = app(SupportStepDeliveryService::class)->processDueScenarios(CarbonImmutable::parse('2026-05-12 20:00:00', 'Asia/Tokyo'));

        $this->assertSame(['sent' => 1, 'skipped' => 0, 'failed' => 0], $result);
        $this->assertDatabaseHas('support_step_deliveries', [
            'support_step_scenario_id' => $scenario->id,
            'account_id' => $user->id,
            'requester_role' => 'therapist',
            'status' => SupportStepDelivery::STATUS_SENT,
        ]);
    }

    private function accountWithRole(string $role, array $attributes = []): Account
    {
        $account = Account::factory()->create([
            'last_active_role' => $role,
            ...$attributes,
        ]);
        $account->roleAssignments()->create([
            'role' => $role,
            'status' => 'active',
            'granted_at' => now(),
        ]);

        return $account;
    }

    private function scenario(Account $admin, array $attributes = []): SupportStepScenario
    {
        return SupportStepScenario::create([
            'public_id' => 'sss_'.strtolower((string) str()->ulid()),
            'name' => '本人確認のご案内',
            'status' => SupportStepScenario::STATUS_ACTIVE,
            'target_role' => SupportStepScenario::TARGET_USER,
            'identity_verification_status' => SupportStepScenario::IDENTITY_UNVERIFIED,
            'elapsed_days' => 1,
            'send_time' => '20:00',
            'priority' => 100,
            'ticket_title' => '本人確認のご案内',
            'ticket_category' => 'account',
            'message_body' => '{user_name}さん、本人確認をお願いします。',
            'created_by_account_id' => $admin->id,
            'updated_by_account_id' => $admin->id,
            ...$attributes,
        ]);
    }
}
