<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
            ->assertJsonPath('data.0.account.public_id', $therapist->public_id);

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

    public function test_non_admin_cannot_review_therapist_profile(): void
    {
        [, $profile, $therapist] = $this->createAdminTherapistProfileFixture();

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
