<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\IdentityVerification;
use App\Models\ServiceAddress;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TherapistProfileReviewTest extends TestCase
{
    use RefreshDatabase;

    public function test_upsert_creates_draft_profile_and_review_status_shows_missing_requirements(): void
    {
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_draft']);
        $token = $therapist->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->putJson('/api/me/therapist-profile', [
                'public_name' => 'Draft Therapist',
                'bio' => 'Relaxation focused body care.',
                'training_status' => 'completed',
            ])
            ->assertOk()
            ->assertJsonPath('data.profile_status', 'draft')
            ->assertJsonPath('data.photo_review_status', 'pending');

        $this->withToken($token)
            ->putJson('/api/me/therapist/location', [
                'lat' => 35.681236,
                'lng' => 139.767125,
            ])
            ->assertOk()
            ->assertJsonPath('data.is_online', false);

        $this->withToken($token)
            ->getJson('/api/me/therapist-profile/review-status')
            ->assertOk()
            ->assertJsonPath('data.profile.profile_status', 'draft')
            ->assertJsonPath('data.can_submit', false)
            ->assertJsonPath('data.active_menu_count', 0)
            ->assertJsonPath('data.latest_identity_verification_status', null)
            ->assertJsonPath('data.requirements.0.key', 'public_name')
            ->assertJsonPath('data.requirements.0.is_satisfied', true)
            ->assertJsonPath('data.requirements.1.key', 'active_menu')
            ->assertJsonPath('data.requirements.1.is_satisfied', false)
            ->assertJsonPath('data.requirements.2.key', 'identity_verification')
            ->assertJsonPath('data.requirements.2.is_satisfied', false);
    }

    public function test_show_returns_numeric_rating_summary_for_profile_without_reviews(): void
    {
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_rating_summary']);
        $profile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_rating_summary',
            'public_name' => 'Rating Summary Therapist',
            'profile_status' => TherapistProfile::STATUS_DRAFT,
            'training_status' => 'completed',
            'photo_review_status' => 'pending',
            'rating_average' => 0,
            'review_count' => 0,
        ]);

        $response = $this->withToken($therapist->createToken('api')->plainTextToken)
            ->getJson('/api/me/therapist-profile')
            ->assertOk();

        $this->assertSame($profile->public_id, $response->json('data.public_id'));
        $this->assertFalse(is_string($response->json('data.rating_average')));
        $this->assertSame(0, $response->json('data.rating_average'));
        $this->assertSame(0, $response->json('data.review_count'));
    }

    public function test_show_returns_body_metrics_and_age_derived_from_identity_verification(): void
    {
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_profile_metrics']);

        TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_profile_metrics',
            'public_name' => 'Profile Metrics Therapist',
            'profile_status' => TherapistProfile::STATUS_DRAFT,
            'training_status' => 'completed',
            'photo_review_status' => 'pending',
            'height_cm' => 178,
            'weight_kg' => 72,
            'p_size_cm' => 15,
        ]);

        IdentityVerification::create([
            'account_id' => $therapist->id,
            'status' => IdentityVerification::STATUS_APPROVED,
            'birthdate_encrypted' => Crypt::encryptString(now()->subYears(29)->subMonth()->toDateString()),
            'birth_year' => now()->subYears(29)->subMonth()->year,
            'is_age_verified' => true,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->getJson('/api/me/therapist-profile')
            ->assertOk()
            ->assertJsonPath('data.age', 29)
            ->assertJsonPath('data.height_cm', 178)
            ->assertJsonPath('data.weight_kg', 72)
            ->assertJsonPath('data.p_size_cm', 15);
    }

    public function test_therapist_can_submit_review_after_requirements_are_met(): void
    {
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_submit']);
        $token = $therapist->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->putJson('/api/me/therapist-profile', [
                'public_name' => 'Submit Therapist',
                'bio' => 'Relaxation focused body care.',
            ])
            ->assertOk()
            ->assertJsonPath('data.profile_status', 'draft');

        $this->withToken($token)
            ->postJson('/api/me/therapist-profile/submit-review')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['active_menu', 'identity_verification']);

        IdentityVerification::create([
            'account_id' => $therapist->id,
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);

        $this->withToken($token)
            ->postJson('/api/me/therapist/menus', [
                'name' => 'Body care 60',
                'duration_minutes' => 60,
                'base_price_amount' => 12000,
            ])
            ->assertCreated();

        $this->withToken($token)
            ->getJson('/api/me/therapist-profile/review-status')
            ->assertOk()
            ->assertJsonPath('data.can_submit', true)
            ->assertJsonPath('data.active_menu_count', 1)
            ->assertJsonPath('data.latest_identity_verification_status', 'approved');

        $this->withToken($token)
            ->postJson('/api/me/therapist-profile/submit-review')
            ->assertOk()
            ->assertJsonPath('data.profile_status', 'pending');

        $this->assertDatabaseHas('therapist_profiles', [
            'account_id' => $therapist->id,
            'profile_status' => 'pending',
            'is_online' => false,
        ]);
    }

    public function test_editing_approved_profile_returns_it_to_draft_and_blocks_quote_creation(): void
    {
        $user = Account::factory()->create(['public_id' => 'acc_user_profile_review']);
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_profile_review']);
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
            'public_id' => 'thp_profile_review',
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
            'public_id' => 'menu_profile_review_60',
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
            'public_id' => 'addr_profile_review',
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
        $this->putJson('/api/me/therapist-profile', [
            'public_name' => 'Approved Therapist',
            'bio' => 'Updated profile text that needs review again.',
            'training_status' => 'completed',
        ])
            ->assertOk()
            ->assertJsonPath('data.profile_status', 'draft')
            ->assertJsonPath('data.is_online', false);

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

    public function test_approved_therapist_can_go_online_and_offline_after_setting_location(): void
    {
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_online_toggle']);
        $token = $therapist->createToken('api')->plainTextToken;

        $profile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_online_toggle',
            'public_name' => 'Online Toggle Therapist',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'photo_review_status' => 'approved',
            'is_online' => false,
            'approved_at' => now(),
        ]);

        TherapistMenu::create([
            'public_id' => 'menu_online_toggle_60',
            'therapist_profile_id' => $profile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
            'is_active' => true,
        ]);

        $this->withToken($token)
            ->postJson('/api/me/therapist/online')
            ->assertConflict();

        $this->withToken($token)
            ->putJson('/api/me/therapist/location', [
                'lat' => 35.681236,
                'lng' => 139.767125,
                'accuracy_m' => 20,
            ])
            ->assertOk()
            ->assertJsonPath('data.is_online', false);

        $this->withToken($token)
            ->postJson('/api/me/therapist/online')
            ->assertOk()
            ->assertJsonPath('data.is_online', true)
            ->assertJsonPath('data.online_since', fn ($value) => filled($value));

        $this->withToken($token)
            ->postJson('/api/me/therapist/offline')
            ->assertOk()
            ->assertJsonPath('data.is_online', false)
            ->assertJsonPath('data.online_since', null);
    }

    public function test_non_approved_therapist_cannot_go_online(): void
    {
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_online_reject']);
        $token = $therapist->createToken('api')->plainTextToken;

        $profile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_online_reject',
            'public_name' => 'Pending Therapist',
            'profile_status' => TherapistProfile::STATUS_PENDING,
            'training_status' => 'completed',
            'photo_review_status' => 'approved',
            'is_online' => false,
        ]);

        $profile->location()->create([
            'lat' => 35.681236,
            'lng' => 139.767125,
            'accuracy_m' => 20,
            'source' => 'browser',
            'is_searchable' => true,
        ]);

        $this->withToken($token)
            ->postJson('/api/me/therapist/online')
            ->assertConflict();
    }

    public function test_restored_suspended_profile_can_be_resubmitted_for_review(): void
    {
        $admin = Account::factory()->create(['public_id' => 'acc_admin_profile_restore']);
        $admin->roleAssignments()->create([
            'role' => 'admin',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_profile_restore']);
        $therapist->roleAssignments()->create([
            'role' => 'therapist',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        IdentityVerification::create([
            'account_id' => $therapist->id,
            'public_id' => 'idv_profile_restore',
            'status' => IdentityVerification::STATUS_APPROVED,
            'document_type' => 'driver_license',
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
            'is_age_verified' => true,
        ]);

        $profile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_profile_restore',
            'public_name' => 'Restore Review Therapist',
            'bio' => 'Relaxation focused body care.',
            'profile_status' => TherapistProfile::STATUS_SUSPENDED,
            'training_status' => 'completed',
            'photo_review_status' => 'approved',
            'rejected_reason_code' => 'policy_violation',
        ]);

        TherapistMenu::create([
            'therapist_profile_id' => $profile->id,
            'public_id' => 'menu_profile_restore_60',
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
            'is_active' => true,
            'sort_order' => 1,
        ]);

        Sanctum::actingAs($admin);
        $this->postJson("/api/admin/therapist-profiles/{$profile->public_id}/restore")
            ->assertOk()
            ->assertJsonPath('data.profile_status', TherapistProfile::STATUS_DRAFT);

        Sanctum::actingAs($therapist);
        $this->getJson('/api/me/therapist-profile/review-status')
            ->assertOk()
            ->assertJsonPath('data.can_submit', true)
            ->assertJsonPath('data.profile.profile_status', TherapistProfile::STATUS_DRAFT);

        $this->postJson('/api/me/therapist-profile/submit-review')
            ->assertOk()
            ->assertJsonPath('data.profile_status', TherapistProfile::STATUS_PENDING);

        $this->assertDatabaseHas('therapist_profiles', [
            'id' => $profile->id,
            'profile_status' => TherapistProfile::STATUS_PENDING,
            'approved_by_account_id' => null,
            'approved_at' => null,
            'rejected_reason_code' => null,
        ]);
    }
}
