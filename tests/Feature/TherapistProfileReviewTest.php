<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\IdentityVerification;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
        $userToken = $user->createToken('api')->plainTextToken;
        $therapistToken = $therapist->createToken('api')->plainTextToken;

        $profileId = $this->withToken($therapistToken)
            ->putJson('/api/me/therapist-profile', [
                'public_name' => 'Approved Therapist',
                'bio' => 'Relaxation focused body care.',
                'training_status' => 'completed',
            ])
            ->assertOk()
            ->assertJsonPath('data.profile_status', 'draft')
            ->json('data.public_id');

        IdentityVerification::create([
            'account_id' => $therapist->id,
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);

        $menuId = $this->withToken($therapistToken)
            ->postJson('/api/me/therapist/menus', [
                'name' => 'Body care 60',
                'duration_minutes' => 60,
                'base_price_amount' => 12000,
            ])
            ->assertCreated()
            ->json('data.public_id');

        $this->withToken($therapistToken)
            ->postJson('/api/me/therapist-profile/submit-review')
            ->assertOk()
            ->assertJsonPath('data.profile_status', 'pending');

        TherapistProfile::query()
            ->where('public_id', $profileId)
            ->firstOrFail()
            ->forceFill([
                'profile_status' => TherapistProfile::STATUS_APPROVED,
                'approved_at' => now(),
            ])
            ->save();

        $this->withToken($therapistToken)
            ->putJson('/api/me/therapist/location', [
                'lat' => 35.681236,
                'lng' => 139.767125,
                'accuracy_m' => 30,
                'source' => 'test',
            ])
            ->assertOk()
            ->assertJsonPath('data.is_online', true);

        $serviceAddressId = $this->withToken($userToken)
            ->postJson('/api/me/service-addresses', [
                'label' => 'Hotel',
                'place_type' => 'hotel',
                'prefecture' => 'Tokyo',
                'city' => 'Chiyoda',
                'address_line' => 'secret address',
                'lat' => 35.682000,
                'lng' => 139.768000,
                'is_default' => true,
            ])
            ->assertCreated()
            ->json('data.public_id');

        $this->withToken($userToken)
            ->postJson('/api/booking-quotes', [
                'therapist_profile_id' => $profileId,
                'therapist_menu_id' => $menuId,
                'service_address_id' => $serviceAddressId,
                'duration_minutes' => 60,
                'is_on_demand' => true,
            ])
            ->assertCreated();

        $this->withToken($therapistToken)
            ->putJson('/api/me/therapist-profile', [
                'public_name' => 'Approved Therapist',
                'bio' => 'Updated profile text that needs review again.',
                'training_status' => 'completed',
            ])
            ->assertOk()
            ->assertJsonPath('data.profile_status', 'draft')
            ->assertJsonPath('data.is_online', false);

        $this->withToken($userToken)
            ->postJson('/api/booking-quotes', [
                'therapist_profile_id' => $profileId,
                'therapist_menu_id' => $menuId,
                'service_address_id' => $serviceAddressId,
                'duration_minutes' => 60,
                'is_on_demand' => true,
            ])
            ->assertNotFound();
    }
}
