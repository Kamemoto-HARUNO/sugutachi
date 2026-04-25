<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\TherapistMenu;
use App\Models\TherapistPricingRule;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminPricingRuleTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_and_view_pricing_rules_with_filters(): void
    {
        [$admin, $matchingProfile, $matchingMenu, $matchingRule] = $this->createAdminPricingRuleFixture();

        $otherTherapist = Account::factory()->create([
            'public_id' => 'acc_admin_pricing_other',
            'display_name' => 'Other Therapist',
        ]);
        $otherProfile = TherapistProfile::create([
            'account_id' => $otherTherapist->id,
            'public_id' => 'thp_admin_pricing_other',
            'public_name' => 'Other Pricing Profile',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
        ]);
        $otherMenu = TherapistMenu::create([
            'therapist_profile_id' => $otherProfile->id,
            'public_id' => 'menu_admin_pricing_other',
            'name' => 'Other Body care 90',
            'duration_minutes' => 90,
            'base_price_amount' => 18000,
            'is_active' => true,
        ]);
        TherapistPricingRule::create([
            'therapist_profile_id' => $otherProfile->id,
            'therapist_menu_id' => $otherMenu->id,
            'rule_type' => TherapistPricingRule::RULE_TYPE_USER_PROFILE_ATTRIBUTE,
            'condition_json' => [
                'field' => TherapistPricingRule::FIELD_BODY_TYPE,
                'operator' => TherapistPricingRule::OPERATOR_EQUALS,
                'value' => 'muscular',
            ],
            'adjustment_type' => TherapistPricingRule::ADJUSTMENT_TYPE_FIXED_AMOUNT,
            'adjustment_amount' => 1000,
            'priority' => 5,
            'is_active' => true,
        ]);

        $token = $admin->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->getJson("/api/admin/pricing-rules?account_id={$matchingProfile->account->public_id}&therapist_profile_id={$matchingProfile->public_id}&therapist_menu_id={$matchingMenu->public_id}&rule_type=demand_level&adjustment_bucket=demand_fee&scope=menu&is_active=1&q=Managed&sort=priority&direction=asc")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $matchingRule->id)
            ->assertJsonPath('data.0.rule_type', TherapistPricingRule::RULE_TYPE_DEMAND_LEVEL)
            ->assertJsonPath('data.0.adjustment_bucket', 'demand_fee')
            ->assertJsonPath('data.0.scope', 'menu')
            ->assertJsonPath('data.0.therapist_profile.public_id', $matchingProfile->public_id)
            ->assertJsonPath('data.0.therapist_profile.account.public_id', $matchingProfile->account->public_id)
            ->assertJsonPath('data.0.therapist_menu.public_id', $matchingMenu->public_id);

        $this->withToken($token)
            ->getJson("/api/admin/pricing-rules/{$matchingRule->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $matchingRule->id)
            ->assertJsonPath('data.condition.value', TherapistPricingRule::DEMAND_LEVEL_BUSY)
            ->assertJsonPath('data.condition_summary', 'equals busy')
            ->assertJsonPath('data.therapist_profile.account.email', $matchingProfile->account->email)
            ->assertJsonPath('data.therapist_menu.name', $matchingMenu->name);

        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'pricing_rule.view',
            'target_type' => TherapistPricingRule::class,
            'target_id' => $matchingRule->id,
        ]);
    }

    public function test_non_admin_cannot_access_pricing_rule_admin_api(): void
    {
        [, $matchingProfile, , $matchingRule] = $this->createAdminPricingRuleFixture();

        $token = $matchingProfile->account->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/admin/pricing-rules')
            ->assertForbidden();

        $this->withToken($token)
            ->getJson("/api/admin/pricing-rules/{$matchingRule->id}")
            ->assertForbidden();

        $this->withToken($token)
            ->postJson("/api/admin/pricing-rules/{$matchingRule->id}/notes", [
                'note' => 'Should not be allowed.',
            ])
            ->assertForbidden();

        $this->withToken($token)
            ->postJson("/api/admin/pricing-rules/{$matchingRule->id}/monitoring", [
                'monitoring_status' => TherapistPricingRule::MONITORING_STATUS_UNDER_REVIEW,
            ])
            ->assertForbidden();
    }

    public function test_admin_can_filter_pricing_rules_by_monitoring_flags(): void
    {
        [$admin, $profile, $menu, $safeRule] = $this->createAdminPricingRuleFixture();

        $inactiveMenu = TherapistMenu::create([
            'therapist_profile_id' => $profile->id,
            'public_id' => 'menu_admin_pricing_inactive',
            'name' => 'Inactive Body care 90',
            'duration_minutes' => 90,
            'base_price_amount' => 18000,
            'is_active' => false,
        ]);
        $inactiveMenuRule = TherapistPricingRule::create([
            'therapist_profile_id' => $profile->id,
            'therapist_menu_id' => $inactiveMenu->id,
            'rule_type' => TherapistPricingRule::RULE_TYPE_USER_PROFILE_ATTRIBUTE,
            'condition_json' => [
                'field' => TherapistPricingRule::FIELD_BODY_TYPE,
                'operator' => TherapistPricingRule::OPERATOR_EQUALS,
                'value' => 'muscular',
            ],
            'adjustment_type' => TherapistPricingRule::ADJUSTMENT_TYPE_FIXED_AMOUNT,
            'adjustment_amount' => 18000,
            'priority' => 20,
            'is_active' => true,
        ]);
        $extremePercentageRule = TherapistPricingRule::create([
            'therapist_profile_id' => $profile->id,
            'therapist_menu_id' => null,
            'rule_type' => TherapistPricingRule::RULE_TYPE_TIME_BAND,
            'condition_json' => [
                'start_hour' => 21,
                'end_hour' => 24,
            ],
            'adjustment_type' => TherapistPricingRule::ADJUSTMENT_TYPE_PERCENTAGE,
            'adjustment_amount' => 120,
            'priority' => 30,
            'is_active' => true,
        ]);

        $token = $admin->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/admin/pricing-rules?has_monitoring_flags=1&sort=priority&direction=asc')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.id', $inactiveMenuRule->id)
            ->assertJsonPath('data.0.has_monitoring_flags', true)
            ->assertJsonPath('data.1.id', $extremePercentageRule->id)
            ->assertJsonMissingPath('data.2');

        $this->withToken($token)
            ->getJson('/api/admin/pricing-rules?monitoring_flag=inactive_menu&sort=priority&direction=asc')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $inactiveMenuRule->id)
            ->assertJsonPath('data.0.monitoring_flags.0', TherapistPricingRule::MONITORING_FLAG_INACTIVE_MENU)
            ->assertJsonFragment([
                'monitoring_flags' => [
                    TherapistPricingRule::MONITORING_FLAG_INACTIVE_MENU,
                    TherapistPricingRule::MONITORING_FLAG_MENU_PRICE_OVERRIDE,
                ],
            ]);

        $this->withToken($token)
            ->getJson('/api/admin/pricing-rules?has_monitoring_flags=0&sort=priority&direction=asc')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $safeRule->id)
            ->assertJsonPath('data.0.has_monitoring_flags', false);
    }

    public function test_admin_can_note_and_update_monitoring_status_for_pricing_rule(): void
    {
        [$admin, $profile, $menu, $rule] = $this->createAdminPricingRuleFixture();

        $token = $admin->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->postJson("/api/admin/pricing-rules/{$rule->id}/notes", [
                'note' => 'Need to confirm whether this demand surcharge is intentional.',
            ])
            ->assertOk()
            ->assertJsonPath('data.id', $rule->id)
            ->assertJsonPath('data.admin_note_count', 1)
            ->assertJsonPath('data.notes.0.note', 'Need to confirm whether this demand surcharge is intentional.');

        $this->withToken($token)
            ->postJson("/api/admin/pricing-rules/{$rule->id}/monitoring", [
                'monitoring_status' => TherapistPricingRule::MONITORING_STATUS_UNDER_REVIEW,
                'note' => 'Operations is checking whether this should remain active.',
            ])
            ->assertOk()
            ->assertJsonPath('data.id', $rule->id)
            ->assertJsonPath('data.monitoring_status', TherapistPricingRule::MONITORING_STATUS_UNDER_REVIEW)
            ->assertJsonPath('data.monitored_by_admin.public_id', $admin->public_id)
            ->assertJsonPath('data.admin_note_count', 2)
            ->assertJsonPath('data.notes.1.note', 'Operations is checking whether this should remain active.');

        $this->withToken($token)
            ->getJson('/api/admin/pricing-rules?monitoring_status='.TherapistPricingRule::MONITORING_STATUS_UNDER_REVIEW.'&monitored_by_admin_account_id='.$admin->public_id.'&has_notes=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $rule->id)
            ->assertJsonPath('data.0.monitoring_status', TherapistPricingRule::MONITORING_STATUS_UNDER_REVIEW)
            ->assertJsonPath('data.0.admin_note_count', 2);

        $this->assertDatabaseHas('admin_notes', [
            'author_account_id' => $admin->id,
            'target_type' => TherapistPricingRule::class,
            'target_id' => $rule->id,
        ]);
        $this->assertDatabaseHas('therapist_pricing_rules', [
            'id' => $rule->id,
            'monitoring_status' => TherapistPricingRule::MONITORING_STATUS_UNDER_REVIEW,
            'monitored_by_admin_account_id' => $admin->id,
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'pricing_rule.note',
            'target_type' => TherapistPricingRule::class,
            'target_id' => $rule->id,
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'pricing_rule.monitor',
            'target_type' => TherapistPricingRule::class,
            'target_id' => $rule->id,
        ]);
    }

    private function createAdminPricingRuleFixture(): array
    {
        $admin = Account::factory()->create(['public_id' => 'acc_admin_pricing_rules']);
        $admin->roleAssignments()->create([
            'role' => 'admin',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        $therapist = Account::factory()->create([
            'public_id' => 'acc_managed_pricing_therapist',
            'display_name' => 'Managed Pricing Therapist',
            'email' => 'managed-pricing@example.com',
        ]);
        $profile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_managed_pricing',
            'public_name' => 'Managed Pricing Profile',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
        ]);
        $menu = TherapistMenu::create([
            'therapist_profile_id' => $profile->id,
            'public_id' => 'menu_managed_pricing',
            'name' => 'Managed Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
            'is_active' => true,
        ]);
        $rule = TherapistPricingRule::create([
            'therapist_profile_id' => $profile->id,
            'therapist_menu_id' => $menu->id,
            'rule_type' => TherapistPricingRule::RULE_TYPE_DEMAND_LEVEL,
            'condition_json' => [
                'operator' => TherapistPricingRule::OPERATOR_EQUALS,
                'value' => TherapistPricingRule::DEMAND_LEVEL_BUSY,
            ],
            'adjustment_type' => TherapistPricingRule::ADJUSTMENT_TYPE_PERCENTAGE,
            'adjustment_amount' => 15,
            'min_price_amount' => 13000,
            'priority' => 10,
            'is_active' => true,
            'monitoring_status' => TherapistPricingRule::MONITORING_STATUS_UNREVIEWED,
        ]);

        return [$admin, $profile, $menu, $rule];
    }
}
