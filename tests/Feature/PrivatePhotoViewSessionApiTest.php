<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\IdentityVerification;
use App\Models\ProfilePhoto;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PrivatePhotoViewSessionApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_verified_viewer_can_open_private_photo_session_and_is_locked_for_twenty_four_hours(): void
    {
        Storage::fake('local');

        $viewer = Account::factory()->create(['public_id' => 'acc_private_viewer']);
        IdentityVerification::create([
            'account_id' => $viewer->id,
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);

        $therapist = Account::factory()->create(['public_id' => 'acc_private_target']);
        $profile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_private_target',
            'public_name' => 'Private Photo Therapist',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'photo_review_status' => ProfilePhoto::STATUS_APPROVED,
            'is_listed' => true,
        ]);
        TherapistMenu::create([
            'public_id' => 'menu_private_target_60',
            'therapist_profile_id' => $profile->id,
            'name' => 'Private Body Care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
            'is_active' => true,
        ]);
        IdentityVerification::create([
            'account_id' => $therapist->id,
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);

        $upload = UploadedFile::fake()->image('private-photo.jpg', 800, 800);
        $path = 'profiles/acc_private_target/private-photo.jpg';
        Storage::disk('local')->put($path, file_get_contents($upload->getRealPath()));

        $privatePhoto = ProfilePhoto::create([
            'account_id' => $therapist->id,
            'therapist_profile_id' => $profile->id,
            'usage_type' => 'therapist_profile',
            'visibility' => ProfilePhoto::VISIBILITY_PRIVATE,
            'storage_key_encrypted' => Crypt::encryptString($path),
            'content_hash' => hash_file('sha256', $upload->getRealPath()),
            'status' => ProfilePhoto::STATUS_APPROVED,
            'sort_order' => 0,
        ]);

        $viewerToken = $viewer->createToken('api')->plainTextToken;

        $this->withToken($viewerToken)
            ->getJson("/api/therapists/{$profile->public_id}")
            ->assertOk()
            ->assertJsonPath('data.private_photo_summary.count', 1)
            ->assertJsonPath('data.private_photo_summary.can_view', true);

        $sessionToken = $this->withToken($viewerToken)
            ->postJson("/api/therapists/{$profile->public_id}/private-photo-sessions")
            ->assertCreated()
            ->assertJsonPath('data.photos.0.id', $privatePhoto->id)
            ->json('data.session_token');

        $response = $this->withToken($viewerToken)
            ->get("/api/private-photo-sessions/{$sessionToken}/photos/{$privatePhoto->id}/file")
            ->assertOk();

        $this->assertStringStartsWith('image/', (string) $response->headers->get('content-type'));
        $this->assertNotEmpty($response->getContent());
        $this->assertNotNull($response->headers->get('X-Private-Photo-Locked-Until'));

        $this->withToken($viewerToken)
            ->postJson("/api/therapists/{$profile->public_id}/private-photo-sessions")
            ->assertStatus(423)
            ->assertJsonPath('message', 'この非公開写真はまだ再表示できません。');

        $this->withToken($viewerToken)
            ->getJson("/api/therapists/{$profile->public_id}")
            ->assertOk()
            ->assertJsonPath('data.private_photo_summary.can_view', false)
            ->assertJson(fn ($json) => $json
                ->where('data.private_photo_summary.count', 1)
                ->whereType('data.private_photo_summary.next_available_at', 'string')
                ->etc());
    }

    public function test_unverified_viewer_cannot_open_private_photo_session(): void
    {
        Storage::fake('local');

        $viewer = Account::factory()->create(['public_id' => 'acc_private_unverified']);
        $therapist = Account::factory()->create(['public_id' => 'acc_private_verified_target']);
        $profile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_private_verified_target',
            'public_name' => 'Verified Private Therapist',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'photo_review_status' => ProfilePhoto::STATUS_APPROVED,
            'is_listed' => true,
        ]);
        TherapistMenu::create([
            'public_id' => 'menu_private_verified_target_60',
            'therapist_profile_id' => $profile->id,
            'name' => 'Verified Private Care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
            'is_active' => true,
        ]);
        IdentityVerification::create([
            'account_id' => $therapist->id,
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);

        $upload = UploadedFile::fake()->image('private-photo-2.jpg', 800, 800);
        $path = 'profiles/acc_private_verified_target/private-photo-2.jpg';
        Storage::disk('local')->put($path, file_get_contents($upload->getRealPath()));

        ProfilePhoto::create([
            'account_id' => $therapist->id,
            'therapist_profile_id' => $profile->id,
            'usage_type' => 'therapist_profile',
            'visibility' => ProfilePhoto::VISIBILITY_PRIVATE,
            'storage_key_encrypted' => Crypt::encryptString($path),
            'content_hash' => hash_file('sha256', $upload->getRealPath()),
            'status' => ProfilePhoto::STATUS_APPROVED,
            'sort_order' => 0,
        ]);

        $viewerToken = $viewer->createToken('api')->plainTextToken;

        $this->withToken($viewerToken)
            ->getJson("/api/therapists/{$profile->public_id}")
            ->assertOk()
            ->assertJsonPath('data.private_photo_summary.requires_identity_verification', true)
            ->assertJsonPath('data.private_photo_summary.can_view', false);

        $this->withToken($viewerToken)
            ->postJson("/api/therapists/{$profile->public_id}/private-photo-sessions")
            ->assertStatus(422)
            ->assertJsonValidationErrors('private_photos');
    }

    public function test_therapist_can_preview_own_private_photos_without_twenty_four_hour_lock(): void
    {
        Storage::fake('local');

        $therapist = Account::factory()->create(['public_id' => 'acc_private_self_preview']);
        $profile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_private_self_preview',
            'public_name' => 'Self Preview Therapist',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'photo_review_status' => ProfilePhoto::STATUS_APPROVED,
            'is_listed' => true,
        ]);

        $upload = UploadedFile::fake()->image('self-preview-private.jpg', 800, 800);
        $path = 'profiles/acc_private_self_preview/self-preview-private.jpg';
        Storage::disk('local')->put($path, file_get_contents($upload->getRealPath()));

        $privatePhoto = ProfilePhoto::create([
            'account_id' => $therapist->id,
            'therapist_profile_id' => $profile->id,
            'usage_type' => 'therapist_profile',
            'visibility' => ProfilePhoto::VISIBILITY_PRIVATE,
            'storage_key_encrypted' => Crypt::encryptString($path),
            'content_hash' => hash_file('sha256', $upload->getRealPath()),
            'status' => ProfilePhoto::STATUS_APPROVED,
            'sort_order' => 0,
        ]);

        $token = $therapist->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->getJson("/api/therapists/{$profile->public_id}")
            ->assertOk()
            ->assertJsonPath('data.is_self_view', true)
            ->assertJsonPath('data.private_photo_summary.count', 1)
            ->assertJsonPath('data.private_photo_summary.can_view', true)
            ->assertJsonPath('data.private_photo_summary.next_available_at', null);

        $firstSessionToken = $this->withToken($token)
            ->postJson("/api/therapists/{$profile->public_id}/private-photo-sessions")
            ->assertCreated()
            ->json('data.session_token');

        $firstResponse = $this->withToken($token)
            ->get("/api/private-photo-sessions/{$firstSessionToken}/photos/{$privatePhoto->id}/file")
            ->assertOk();

        $this->assertNull($firstResponse->headers->get('X-Private-Photo-Locked-Until'));

        $this->withToken($token)
            ->postJson("/api/therapists/{$profile->public_id}/private-photo-sessions")
            ->assertCreated();
    }
}
