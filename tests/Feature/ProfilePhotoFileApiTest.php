<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\IdentityVerification;
use App\Models\ProfilePhoto;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ProfilePhotoFileApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_fetch_own_profile_photo_file(): void
    {
        $account = Account::factory()->create(['public_id' => 'acc_photo_owner']);
        $path = 'profiles/acc_photo_owner/test-owner.webp';
        Storage::disk('local')->put($path, 'owner-photo');

        $photo = ProfilePhoto::create([
            'account_id' => $account->id,
            'usage_type' => 'account_profile',
            'storage_key_encrypted' => Crypt::encryptString($path),
            'content_hash' => hash('sha256', 'owner-photo'),
            'status' => ProfilePhoto::STATUS_APPROVED,
            'sort_order' => 0,
        ]);

        $response = $this->withToken($account->createToken('api')->plainTextToken)
            ->get("/api/me/profile/photos/{$photo->id}/file")
            ->assertOk();

        $this->assertSame('owner-photo', $response->streamedContent());
    }

    public function test_public_can_fetch_approved_public_profile_photo_file(): void
    {
        $account = Account::factory()->create(['public_id' => 'acc_public_photo']);
        $profile = TherapistProfile::create([
            'account_id' => $account->id,
            'public_id' => 'thp_public_photo',
            'public_name' => 'Public Photo Therapist',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'photo_review_status' => ProfilePhoto::STATUS_APPROVED,
        ]);
        IdentityVerification::create([
            'account_id' => $account->id,
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);

        $path = 'profiles/acc_public_photo/test-public.webp';
        Storage::disk('local')->put($path, 'public-photo');

        $photo = ProfilePhoto::create([
            'account_id' => $account->id,
            'therapist_profile_id' => $profile->id,
            'usage_type' => 'therapist_profile',
            'storage_key_encrypted' => Crypt::encryptString($path),
            'content_hash' => hash('sha256', 'public-photo'),
            'status' => ProfilePhoto::STATUS_APPROVED,
            'sort_order' => 0,
        ]);

        $response = $this->get("/api/profile-photos/{$photo->id}/file")
            ->assertOk();

        $this->assertSame('public-photo', $response->streamedContent());
    }
}
