<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\ProfilePhoto;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ProfilePhotoApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_therapist_can_upload_profile_photo_from_temp_file(): void
    {
        Storage::fake('local');

        $therapist = Account::factory()->create(['public_id' => 'acc_photo_upload']);
        $profile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_photo_upload',
            'public_name' => 'Photo Upload Therapist',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'photo_review_status' => ProfilePhoto::STATUS_APPROVED,
        ]);
        $token = $therapist->createToken('api')->plainTextToken;

        $tempFileId = $this->withToken($token)
            ->post('/api/temp-files', [
                'purpose' => 'profile_photo',
                'file' => UploadedFile::fake()->image('profile.jpg', 800, 800),
            ])
            ->assertCreated()
            ->json('data.file_id');

        $photoId = $this->withToken($token)
            ->postJson('/api/me/profile/photos', [
                'temp_file_id' => $tempFileId,
                'usage_type' => 'therapist_profile',
                'sort_order' => 2,
            ])
            ->assertCreated()
            ->assertJsonPath('data.usage_type', 'therapist_profile')
            ->assertJsonPath('data.status', ProfilePhoto::STATUS_APPROVED)
            ->assertJsonPath('data.sort_order', 2)
            ->assertJsonPath('data.therapist_profile.public_id', $profile->public_id)
            ->json('data.id');

        $photo = ProfilePhoto::query()->findOrFail($photoId);

        $this->assertDatabaseHas('temp_files', [
            'file_id' => $tempFileId,
            'status' => 'used',
        ]);
        $this->assertSame(ProfilePhoto::STATUS_APPROVED, $profile->fresh()->photo_review_status);
        Storage::disk('local')->assertExists(Crypt::decryptString($photo->storage_key_encrypted));
    }

    public function test_non_therapist_upload_defaults_to_account_profile_photo(): void
    {
        Storage::fake('local');

        $account = Account::factory()->create(['public_id' => 'acc_account_photo']);
        $token = $account->createToken('api')->plainTextToken;

        $tempFileId = $this->withToken($token)
            ->post('/api/temp-files', [
                'purpose' => 'profile_photo',
                'file' => UploadedFile::fake()->image('account.jpg', 600, 600),
            ])
            ->assertCreated()
            ->json('data.file_id');

        $this->withToken($token)
            ->postJson('/api/me/profile/photos', [
                'temp_file_id' => $tempFileId,
            ])
            ->assertCreated()
            ->assertJsonPath('data.usage_type', 'account_profile')
            ->assertJsonPath('data.therapist_profile', null);

        $this->assertDatabaseHas('profile_photos', [
            'account_id' => $account->id,
            'usage_type' => 'account_profile',
            'therapist_profile_id' => null,
            'status' => ProfilePhoto::STATUS_APPROVED,
        ]);
    }

    public function test_account_can_delete_own_profile_photo_and_refresh_status(): void
    {
        Storage::fake('local');

        $therapist = Account::factory()->create(['public_id' => 'acc_photo_delete']);
        $profile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_photo_delete',
            'public_name' => 'Photo Delete Therapist',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'photo_review_status' => ProfilePhoto::STATUS_APPROVED,
        ]);
        $path = 'profiles/'.$therapist->public_id.'/approved.jpg';
        Storage::disk('local')->put($path, 'approved-photo');

        $photo = ProfilePhoto::create([
            'account_id' => $therapist->id,
            'therapist_profile_id' => $profile->id,
            'usage_type' => 'therapist_profile',
            'storage_key_encrypted' => Crypt::encryptString($path),
            'content_hash' => hash('sha256', 'approved-photo'),
            'status' => ProfilePhoto::STATUS_APPROVED,
            'sort_order' => 0,
        ]);

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->deleteJson("/api/me/profile/photos/{$photo->id}")
            ->assertNoContent();

        Storage::disk('local')->assertMissing($path);
        $this->assertDatabaseMissing('profile_photos', [
            'id' => $photo->id,
        ]);
        $this->assertSame(ProfilePhoto::STATUS_PENDING, $profile->fresh()->photo_review_status);
    }
}
