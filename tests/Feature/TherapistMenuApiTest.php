<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\BookingQuote;
use App\Models\IdentityVerification;
use App\Models\ServiceAddress;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TherapistMenuApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_therapist_can_create_menu_with_hourly_rate_and_minimum_duration(): void
    {
        $therapist = Account::factory()->create(['public_id' => 'acc_menu_hourly']);
        $token = $therapist->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->putJson('/api/me/therapist-profile', [
                'public_name' => 'Hourly Menu Owner',
                'bio' => 'Conversation and relaxation focused.',
            ])
            ->assertOk();

        $menuId = $this->withToken($token)
            ->postJson('/api/me/therapist/menus', [
                'name' => 'リラクゼーション',
                'description' => '会話しながらゆったり過ごせます。',
                'minimum_duration_minutes' => 90,
                'hourly_rate_amount' => 12000,
                'sort_order' => 2,
            ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'リラクゼーション')
            ->assertJsonPath('data.duration_minutes', 90)
            ->assertJsonPath('data.minimum_duration_minutes', 90)
            ->assertJsonPath('data.base_price_amount', 18000)
            ->assertJsonPath('data.hourly_rate_amount', 12000)
            ->json('data.public_id');

        $this->assertDatabaseHas('therapist_menus', [
            'public_id' => $menuId,
            'duration_minutes' => 90,
            'base_price_amount' => 18000,
            'sort_order' => 2,
        ]);
    }

    public function test_therapist_can_update_and_delete_own_unused_menu(): void
    {
        $therapist = Account::factory()->create(['public_id' => 'acc_menu_owner']);
        $token = $therapist->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->putJson('/api/me/therapist-profile', [
                'public_name' => 'Menu Owner',
                'bio' => 'Relaxation focused body care.',
            ])
            ->assertOk();

        $menuId = $this->withToken($token)
            ->postJson('/api/me/therapist/menus', [
                'name' => 'Body care 60',
                'description' => 'Initial description',
                'duration_minutes' => 60,
                'base_price_amount' => 12000,
            ])
            ->assertCreated()
            ->json('data.public_id');

        $this->withToken($token)
            ->patchJson("/api/me/therapist/menus/{$menuId}", [
                'name' => 'Body care 90',
                'description' => 'Updated description',
                'duration_minutes' => 90,
                'base_price_amount' => 18000,
                'is_active' => false,
                'sort_order' => 3,
            ])
            ->assertOk()
            ->assertJsonPath('data.public_id', $menuId)
            ->assertJsonPath('data.name', 'Body care 90')
            ->assertJsonPath('data.duration_minutes', 90)
            ->assertJsonPath('data.base_price_amount', 18000)
            ->assertJsonPath('data.is_active', false)
            ->assertJsonPath('data.sort_order', 3);

        $this->assertDatabaseHas('therapist_menus', [
            'public_id' => $menuId,
            'name' => 'Body care 90',
            'duration_minutes' => 90,
            'base_price_amount' => 18000,
            'is_active' => false,
            'sort_order' => 3,
        ]);

        $this->withToken($token)
            ->deleteJson("/api/me/therapist/menus/{$menuId}")
            ->assertNoContent();

        $this->assertDatabaseMissing('therapist_menus', [
            'public_id' => $menuId,
        ]);
    }

    public function test_substantive_menu_change_returns_approved_profile_to_draft(): void
    {
        $user = Account::factory()->create(['public_id' => 'acc_user_menu_recheck']);
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_menu_recheck']);
        $userToken = $user->createToken('api')->plainTextToken;
        $therapistToken = $therapist->createToken('api')->plainTextToken;
        $therapist->roleAssignments()->create([
            'role' => 'therapist',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        IdentityVerification::create([
            'account_id' => $therapist->id,
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);

        $profile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_menu_recheck',
            'public_name' => 'Approved Therapist',
            'bio' => 'Relaxation focused body care.',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'photo_review_status' => 'approved',
            'is_online' => true,
            'online_since' => now()->subMinutes(5),
            'approved_at' => now(),
        ]);
        $menu = TherapistMenu::create([
            'public_id' => 'menu_recheck_60',
            'therapist_profile_id' => $profile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
            'is_active' => true,
        ]);
        $profile->location()->create([
            'lat' => 35.681236,
            'lng' => 139.767125,
            'accuracy_m' => 30,
            'source' => 'test',
            'is_searchable' => true,
        ]);

        $serviceAddressId = ServiceAddress::create([
            'public_id' => 'addr_menu_recheck',
            'account_id' => $user->id,
            'label' => 'Hotel',
            'place_type' => 'hotel',
            'prefecture' => 'Tokyo',
            'city' => 'Chiyoda',
            'address_line_encrypted' => Crypt::encryptString('secret address'),
            'lat' => 35.682000,
            'lng' => 139.768000,
            'is_default' => true,
        ])->public_id;

        Sanctum::actingAs($user);
        $this->postJson('/api/booking-quotes', [
            'therapist_profile_id' => $profile->public_id,
            'therapist_menu_id' => $menu->public_id,
            'service_address_id' => $serviceAddressId,
            'duration_minutes' => 60,
            'is_on_demand' => true,
        ])
            ->assertCreated();

        Sanctum::actingAs($therapist);
        $this->patchJson("/api/me/therapist/menus/{$menu->public_id}", [
            'base_price_amount' => 15000,
        ])
            ->assertOk()
            ->assertJsonPath('data.base_price_amount', 15000);

        $this->assertDatabaseHas('therapist_profiles', [
            'public_id' => $profile->public_id,
            'profile_status' => TherapistProfile::STATUS_DRAFT,
            'is_online' => false,
        ]);

        Sanctum::actingAs($user);
        $this->postJson('/api/booking-quotes', [
            'therapist_profile_id' => $profile->public_id,
            'therapist_menu_id' => $menu->public_id,
            'service_address_id' => $serviceAddressId,
            'duration_minutes' => 60,
            'is_on_demand' => true,
        ])
            ->assertNotFound();
    }

    public function test_used_menu_cannot_be_deleted(): void
    {
        $therapist = Account::factory()->create(['public_id' => 'acc_menu_used']);
        $token = $therapist->createToken('api')->plainTextToken;

        $profile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_menu_used',
            'public_name' => 'Used Menu Therapist',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
        ]);

        $menu = $profile->menus()->create([
            'therapist_profile_id' => $profile->id,
            'public_id' => 'menu_used_60',
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
            'is_active' => true,
            'sort_order' => 0,
        ]);

        $quote = BookingQuote::create([
            'public_id' => 'quote_menu_used',
            'therapist_profile_id' => $profile->id,
            'therapist_menu_id' => $menu->id,
            'duration_minutes' => 60,
            'base_amount' => 12000,
            'travel_fee_amount' => 1000,
            'night_fee_amount' => 0,
            'demand_fee_amount' => 0,
            'profile_adjustment_amount' => 0,
            'matching_fee_amount' => 300,
            'platform_fee_amount' => 1200,
            'total_amount' => 13300,
            'therapist_gross_amount' => 12000,
            'therapist_net_amount' => 10800,
            'calculation_version' => 'mvp-v1',
            'input_snapshot_json' => [],
            'applied_rules_json' => [],
            'expires_at' => now()->addMinutes(10),
        ]);

        $this->withToken($token)
            ->deleteJson("/api/me/therapist/menus/{$menu->public_id}")
            ->assertStatus(409);

        $this->assertDatabaseHas('therapist_menus', [
            'id' => $menu->id,
        ]);
    }
}
