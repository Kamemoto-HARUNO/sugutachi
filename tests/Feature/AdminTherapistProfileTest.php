<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\IdentityVerification;
use App\Models\ProfilePhoto;
use App\Models\StripeConnectedAccount;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Tests\TestCase;

class AdminTherapistProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_and_approve_pending_therapist_profile(): void
    {
        [$admin, $profile, $therapist] = $this->createAdminTherapistProfileFixture();
        TherapistProfile::create([
            'account_id' => Account::factory()->create(['public_id' => 'acc_other_therapist_review'])->id,
            'public_id' => 'thp_admin_review_other',
            'public_name' => 'Another Therapist',
            'bio' => 'Another profile',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'none',
            'photo_review_status' => 'pending',
        ]);
        $token = $admin->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->getJson("/api/admin/therapist-profiles?status=pending&account_id={$therapist->public_id}&training_status=completed&q=Admin%20Review&sort=created_at&direction=desc")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $profile->public_id)
            ->assertJsonPath('data.0.account.public_id', $therapist->public_id)
            ->assertJsonPath('data.0.available_actions.approve', true)
            ->assertJsonPath('data.0.available_actions.restore', false);

        $this->withToken($token)
            ->postJson("/api/admin/therapist-profiles/{$profile->public_id}/approve")
            ->assertOk()
            ->assertJsonPath('data.profile_status', TherapistProfile::STATUS_APPROVED)
            ->assertJsonPath('data.approved_by.public_id', $admin->public_id);

        $this->assertDatabaseHas('therapist_profiles', [
            'id' => $profile->id,
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'approved_by_account_id' => $admin->id,
            'rejected_reason_code' => null,
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'therapist_profile.approve',
            'target_type' => TherapistProfile::class,
            'target_id' => $profile->id,
        ]);
    }

    public function test_admin_can_view_therapist_profile_detail_with_operational_context(): void
    {
        [$admin, $profile, $therapist] = $this->createAdminTherapistProfileFixture(TherapistProfile::STATUS_SUSPENDED);

        IdentityVerification::create([
            'account_id' => $therapist->id,
            'public_id' => 'idv_admin_therapist_review',
            'status' => IdentityVerification::STATUS_APPROVED,
            'document_type' => 'driver_license',
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now()->subHours(12),
            'is_age_verified' => true,
        ]);

        $profile->location()->create([
            'lat' => 35.681236,
            'lng' => 139.767125,
            'accuracy_m' => 25,
            'source' => 'browser',
            'is_searchable' => true,
        ]);

        $photo = ProfilePhoto::create([
            'account_id' => $therapist->id,
            'therapist_profile_id' => $profile->id,
            'usage_type' => 'therapist_profile',
            'storage_key_encrypted' => Crypt::encryptString('photos/admin-review.jpg'),
            'content_hash' => 'hash-admin-review',
            'status' => ProfilePhoto::STATUS_APPROVED,
            'sort_order' => 1,
            'reviewed_by_account_id' => $admin->id,
            'reviewed_at' => now()->subHours(6),
        ]);

        StripeConnectedAccount::create([
            'account_id' => $therapist->id,
            'therapist_profile_id' => $profile->id,
            'stripe_account_id' => 'acct_admin_therapist_review',
            'account_type' => 'express',
            'status' => StripeConnectedAccount::STATUS_ACTIVE,
            'charges_enabled' => true,
            'payouts_enabled' => true,
            'details_submitted' => true,
            'onboarding_completed_at' => now()->subDay(),
            'last_synced_at' => now(),
        ]);

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->getJson("/api/admin/therapist-profiles/{$profile->public_id}")
            ->assertOk()
            ->assertJsonPath('data.public_id', $profile->public_id)
            ->assertJsonPath('data.account.public_id', $therapist->public_id)
            ->assertJsonPath('data.account.status', $therapist->status)
            ->assertJsonPath('data.latest_identity_verification.status', IdentityVerification::STATUS_APPROVED)
            ->assertJsonPath('data.location.is_searchable', true)
            ->assertJsonPath('data.photos.0.id', $photo->id)
            ->assertJsonPath('data.photos.0.status', ProfilePhoto::STATUS_APPROVED)
            ->assertJsonPath('data.stripe_connected_account.has_account', true)
            ->assertJsonPath('data.stripe_connected_account.status', StripeConnectedAccount::STATUS_ACTIVE)
            ->assertJsonPath('data.available_actions.restore', true)
            ->assertJsonPath('data.available_actions.approve', false);

        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'therapist_profile.view',
            'target_type' => TherapistProfile::class,
            'target_id' => $profile->id,
        ]);
    }

    public function test_admin_can_filter_therapist_profiles_by_operational_readiness(): void
    {
        [$admin, $matchingProfile, $matchingTherapist] = $this->createAdminTherapistProfileFixture();
        $matchingProfile->forceFill([
            'photo_review_status' => ProfilePhoto::STATUS_PENDING,
            'is_online' => false,
        ])->save();

        TherapistMenu::create([
            'therapist_profile_id' => $matchingProfile->id,
            'public_id' => 'menu_admin_filter_match',
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
            'is_active' => true,
            'sort_order' => 1,
        ]);

        $matchingProfile->location()->create([
            'lat' => 35.681236,
            'lng' => 139.767125,
            'accuracy_m' => 20,
            'source' => 'browser',
            'is_searchable' => true,
        ]);

        IdentityVerification::create([
            'account_id' => $matchingTherapist->id,
            'public_id' => 'idv_admin_filter_match',
            'status' => IdentityVerification::STATUS_APPROVED,
            'document_type' => 'driver_license',
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now()->subHours(10),
            'is_age_verified' => true,
        ]);

        StripeConnectedAccount::create([
            'account_id' => $matchingTherapist->id,
            'therapist_profile_id' => $matchingProfile->id,
            'stripe_account_id' => 'acct_admin_filter_match',
            'account_type' => 'express',
            'status' => StripeConnectedAccount::STATUS_ACTIVE,
        ]);

        $otherTherapist = Account::factory()->create(['public_id' => 'acc_therapist_filter_other']);
        $otherProfile = TherapistProfile::create([
            'account_id' => $otherTherapist->id,
            'public_id' => 'thp_admin_filter_other',
            'public_name' => 'Other Filter Therapist',
            'bio' => 'Relaxation focused body care.',
            'profile_status' => TherapistProfile::STATUS_PENDING,
            'training_status' => 'completed',
            'photo_review_status' => ProfilePhoto::STATUS_PENDING,
        ]);

        TherapistMenu::create([
            'therapist_profile_id' => $otherProfile->id,
            'public_id' => 'menu_admin_filter_other',
            'name' => 'Body care 90',
            'duration_minutes' => 90,
            'base_price_amount' => 16000,
            'is_active' => true,
            'sort_order' => 1,
        ]);

        $otherProfile->location()->create([
            'lat' => 35.6895,
            'lng' => 139.6917,
            'accuracy_m' => 50,
            'source' => 'browser',
            'is_searchable' => true,
        ]);

        IdentityVerification::create([
            'account_id' => $otherTherapist->id,
            'public_id' => 'idv_admin_filter_other',
            'status' => IdentityVerification::STATUS_REJECTED,
            'document_type' => 'driver_license',
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now()->subHours(8),
            'is_age_verified' => false,
        ]);

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->getJson('/api/admin/therapist-profiles?status=pending&photo_review_status=pending&has_searchable_location=1&has_active_menu=1&latest_identity_verification_status=approved&stripe_connected_account_status=active&is_online=0&sort=created_at&direction=desc')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $matchingProfile->public_id)
            ->assertJsonPath('data.0.active_menu_count', 1)
            ->assertJsonPath('data.0.has_searchable_location', true)
            ->assertJsonPath('data.0.latest_identity_verification_status', IdentityVerification::STATUS_APPROVED)
            ->assertJsonPath('data.0.stripe_connected_account_status', StripeConnectedAccount::STATUS_ACTIVE)
            ->assertJsonPath('data.0.available_actions.approve', true);
    }

    public function test_admin_can_reject_pending_therapist_profile(): void
    {
        [$admin, $profile] = $this->createAdminTherapistProfileFixture();

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->postJson("/api/admin/therapist-profiles/{$profile->public_id}/reject", [
                'rejected_reason_code' => 'profile_contains_prohibited_claims',
            ])
            ->assertOk()
            ->assertJsonPath('data.profile_status', TherapistProfile::STATUS_REJECTED)
            ->assertJsonPath('data.rejected_reason_code', 'profile_contains_prohibited_claims');

        $this->assertDatabaseHas('therapist_profiles', [
            'id' => $profile->id,
            'profile_status' => TherapistProfile::STATUS_REJECTED,
            'is_online' => false,
            'rejected_reason_code' => 'profile_contains_prohibited_claims',
        ]);
    }

    public function test_admin_can_suspend_approved_therapist_profile(): void
    {
        [$admin, $profile] = $this->createAdminTherapistProfileFixture(TherapistProfile::STATUS_APPROVED);
        $profile->forceFill(['is_online' => true])->save();

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->postJson("/api/admin/therapist-profiles/{$profile->public_id}/suspend", [
                'rejected_reason_code' => 'policy_violation',
            ])
            ->assertOk()
            ->assertJsonPath('data.profile_status', TherapistProfile::STATUS_SUSPENDED)
            ->assertJsonPath('data.is_online', false);

        $this->assertDatabaseHas('therapist_profiles', [
            'id' => $profile->id,
            'profile_status' => TherapistProfile::STATUS_SUSPENDED,
            'is_online' => false,
            'rejected_reason_code' => 'policy_violation',
        ]);
    }

    public function test_admin_can_restore_suspended_therapist_profile_to_draft(): void
    {
        [$admin, $profile] = $this->createAdminTherapistProfileFixture(TherapistProfile::STATUS_SUSPENDED);
        $profile->forceFill([
            'is_online' => true,
            'online_since' => now()->subMinutes(15),
            'approved_at' => now()->subDay(),
            'approved_by_account_id' => $admin->id,
            'rejected_reason_code' => 'policy_violation',
        ])->save();

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->postJson("/api/admin/therapist-profiles/{$profile->public_id}/restore")
            ->assertOk()
            ->assertJsonPath('data.profile_status', TherapistProfile::STATUS_DRAFT)
            ->assertJsonPath('data.is_online', false)
            ->assertJsonPath('data.approved_at', null)
            ->assertJsonPath('data.rejected_reason_code', 'policy_violation');

        $this->assertDatabaseHas('therapist_profiles', [
            'id' => $profile->id,
            'profile_status' => TherapistProfile::STATUS_DRAFT,
            'is_online' => false,
            'approved_at' => null,
            'approved_by_account_id' => null,
            'rejected_reason_code' => 'policy_violation',
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'therapist_profile.restore',
            'target_type' => TherapistProfile::class,
            'target_id' => $profile->id,
        ]);
    }

    public function test_non_admin_cannot_review_therapist_profile(): void
    {
        [, $profile, $therapist] = $this->createAdminTherapistProfileFixture();

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->getJson("/api/admin/therapist-profiles/{$profile->public_id}")
            ->assertForbidden();

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->postJson("/api/admin/therapist-profiles/{$profile->public_id}/approve")
            ->assertForbidden();
    }

    private function createAdminTherapistProfileFixture(string $status = TherapistProfile::STATUS_PENDING): array
    {
        $admin = Account::factory()->create(['public_id' => 'acc_admin_therapist_review']);
        $admin->roleAssignments()->create([
            'role' => 'admin',
            'status' => 'active',
            'granted_at' => now(),
        ]);
        $therapist = Account::factory()->create([
            'public_id' => 'acc_therapist_review',
            'display_name' => 'Review Therapist',
        ]);

        $profile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_admin_review',
            'public_name' => 'Admin Review Therapist',
            'bio' => 'Relaxation focused body care.',
            'profile_status' => $status,
            'training_status' => 'completed',
            'photo_review_status' => 'approved',
        ]);

        return [$admin, $profile, $therapist];
    }
}
