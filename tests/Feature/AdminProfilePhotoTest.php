<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\ProfilePhoto;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Tests\TestCase;

class AdminProfilePhotoTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_and_approve_profile_photo(): void
    {
        [$admin, $photo, $profile, $therapist] = $this->createAdminProfilePhotoFixture();
        ProfilePhoto::create([
            'account_id' => $therapist->id,
            'therapist_profile_id' => $profile->id,
            'usage_type' => 'therapist_profile',
            'storage_key_encrypted' => Crypt::encryptString('profiles/photo_secondary.jpg'),
            'content_hash' => hash('sha256', 'profiles/photo_secondary.jpg'),
            'status' => ProfilePhoto::STATUS_PENDING,
            'sort_order' => 5,
        ]);
        $token = $admin->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->getJson("/api/admin/profile-photos?status=pending&account_id={$therapist->public_id}&therapist_profile_id={$profile->public_id}&usage_type=therapist_profile&sort=sort_order&direction=asc")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.id', $photo->id)
            ->assertJsonPath('data.0.account.public_id', $therapist->public_id)
            ->assertJsonPath('data.0.therapist_profile.public_id', $profile->public_id);

        $this->withToken($token)
            ->postJson("/api/admin/profile-photos/{$photo->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', ProfilePhoto::STATUS_APPROVED)
            ->assertJsonPath('data.reviewed_by.public_id', $admin->public_id);

        $this->assertDatabaseHas('profile_photos', [
            'id' => $photo->id,
            'status' => ProfilePhoto::STATUS_APPROVED,
            'rejection_reason_code' => null,
            'reviewed_by_account_id' => $admin->id,
        ]);
        $this->assertSame(ProfilePhoto::STATUS_APPROVED, $profile->refresh()->photo_review_status);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'profile_photo.approve',
            'target_type' => ProfilePhoto::class,
            'target_id' => $photo->id,
        ]);
    }

    public function test_admin_can_reject_profile_photo(): void
    {
        [$admin, $photo, $profile] = $this->createAdminProfilePhotoFixture();

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->postJson("/api/admin/profile-photos/{$photo->id}/reject", [
                'rejection_reason_code' => 'not_relaxation_appropriate',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', ProfilePhoto::STATUS_REJECTED)
            ->assertJsonPath('data.rejection_reason_code', 'not_relaxation_appropriate');

        $this->assertDatabaseHas('profile_photos', [
            'id' => $photo->id,
            'status' => ProfilePhoto::STATUS_REJECTED,
            'rejection_reason_code' => 'not_relaxation_appropriate',
            'reviewed_by_account_id' => $admin->id,
        ]);
        $this->assertSame(ProfilePhoto::STATUS_REJECTED, $profile->refresh()->photo_review_status);
    }

    public function test_non_admin_cannot_review_profile_photo(): void
    {
        [, $photo, , $therapist] = $this->createAdminProfilePhotoFixture();

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->postJson("/api/admin/profile-photos/{$photo->id}/approve")
            ->assertForbidden();
    }

    private function createAdminProfilePhotoFixture(): array
    {
        $admin = Account::factory()->create(['public_id' => 'acc_admin_photo']);
        $admin->roleAssignments()->create([
            'role' => 'admin',
            'status' => 'active',
            'granted_at' => now(),
        ]);
        $therapist = Account::factory()->create([
            'public_id' => 'acc_therapist_photo',
            'display_name' => 'Photo Therapist',
        ]);

        $profile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_photo_review',
            'public_name' => 'Photo Review Therapist',
            'profile_status' => TherapistProfile::STATUS_PENDING,
            'training_status' => 'completed',
            'photo_review_status' => ProfilePhoto::STATUS_PENDING,
        ]);

        $photo = ProfilePhoto::create([
            'account_id' => $therapist->id,
            'therapist_profile_id' => $profile->id,
            'usage_type' => 'therapist_profile',
            'storage_key_encrypted' => Crypt::encryptString('profiles/photo.jpg'),
            'content_hash' => hash('sha256', 'profiles/photo.jpg'),
            'status' => ProfilePhoto::STATUS_PENDING,
            'sort_order' => 1,
        ]);

        return [$admin, $photo, $profile, $therapist];
    }
}
