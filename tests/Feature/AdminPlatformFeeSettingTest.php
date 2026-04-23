<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\PlatformFeeSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminPlatformFeeSettingTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_and_create_platform_fee_settings(): void
    {
        [$admin] = $this->createAdminFixture();

        PlatformFeeSetting::create([
            'setting_key' => 'booking_fee_v1',
            'value_json' => ['booking_fee_amount' => 300],
            'active_from' => now()->subDay(),
            'active_until' => now()->addDay(),
            'created_by_account_id' => $admin->id,
        ]);
        PlatformFeeSetting::create([
            'setting_key' => 'booking_fee_v1',
            'value_json' => ['booking_fee_amount' => 500],
            'active_from' => now()->addDay(),
            'created_by_account_id' => $admin->id,
        ]);

        $token = $admin->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/admin/platform-fee-settings?setting_key=booking_fee_v1&is_active=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.setting_key', 'booking_fee_v1')
            ->assertJsonPath('data.0.value_json.booking_fee_amount', 300)
            ->assertJsonPath('data.0.is_active', true);

        $this->withToken($token)
            ->postJson('/api/admin/platform-fee-settings', [
                'setting_key' => 'therapist_platform_fee',
                'value_json' => [
                    'rate_percent' => 10,
                    'fixed_fee_amount' => 0,
                ],
                'active_from' => '2026-05-01T00:00:00+09:00',
            ])
            ->assertCreated()
            ->assertJsonPath('data.setting_key', 'therapist_platform_fee')
            ->assertJsonPath('data.value_json.rate_percent', 10)
            ->assertJsonPath('data.created_by_account.public_id', $admin->public_id);

        $setting = PlatformFeeSetting::query()
            ->where('setting_key', 'therapist_platform_fee')
            ->firstOrFail();

        $this->assertSame(['rate_percent' => 10, 'fixed_fee_amount' => 0], $setting->value_json);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'platform_fee_setting.create',
            'target_type' => PlatformFeeSetting::class,
            'target_id' => $setting->id,
        ]);
    }

    public function test_non_admin_cannot_access_platform_fee_setting_admin_api(): void
    {
        [, $user] = $this->createAdminFixture();

        $this->withToken($user->createToken('api')->plainTextToken)
            ->getJson('/api/admin/platform-fee-settings')
            ->assertForbidden();
    }

    private function createAdminFixture(): array
    {
        $admin = Account::factory()->create(['public_id' => 'acc_admin_fee_settings']);
        $admin->roleAssignments()->create([
            'role' => 'admin',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        $user = Account::factory()->create(['public_id' => 'acc_regular_fee_settings']);
        $user->roleAssignments()->create([
            'role' => 'user',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        return [$admin, $user];
    }
}
