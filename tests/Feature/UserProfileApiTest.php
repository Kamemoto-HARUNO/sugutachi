<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\ProfilePhoto;
use App\Models\TherapistProfile;
use App\Models\UserProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class UserProfileApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_account_can_get_and_update_common_profile(): void
    {
        Storage::fake('local');

        $account = Account::factory()->create([
            'public_id' => 'acc_common_profile',
            'display_name' => 'Initial Name',
            'phone_e164' => '+819011111111',
            'phone_verified_at' => now(),
            'last_active_role' => 'user',
        ]);
        $account->roleAssignments()->create([
            'role' => 'user',
            'status' => 'active',
            'granted_at' => now(),
        ]);
        $profile = TherapistProfile::create([
            'account_id' => $account->id,
            'public_id' => 'thp_common_profile',
            'public_name' => 'Common Therapist',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
        ]);
        $path = 'profiles/'.$account->public_id.'/account.jpg';
        Storage::disk('local')->put($path, 'profile-photo');
        ProfilePhoto::create([
            'account_id' => $account->id,
            'therapist_profile_id' => $profile->id,
            'usage_type' => 'therapist_profile',
            'storage_key_encrypted' => Crypt::encryptString($path),
            'content_hash' => hash('sha256', 'profile-photo'),
            'status' => ProfilePhoto::STATUS_PENDING,
            'sort_order' => 0,
        ]);

        $token = $account->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/me/profile')
            ->assertOk()
            ->assertJsonPath('data.public_id', 'acc_common_profile')
            ->assertJsonPath('data.display_name', 'Initial Name')
            ->assertJsonPath('data.phone_e164', '+819011111111')
            ->assertJsonPath('data.roles.0.role', 'user')
            ->assertJsonCount(1, 'data.photos');

        $this->withToken($token)
            ->patchJson('/api/me/profile', [
                'display_name' => 'Updated Name',
                'phone_e164' => '+819022222222',
            ])
            ->assertOk()
            ->assertJsonPath('data.display_name', 'Updated Name')
            ->assertJsonPath('data.phone_e164', '+819022222222')
            ->assertJsonPath('data.phone_verified_at', null);

        $this->assertDatabaseHas('accounts', [
            'id' => $account->id,
            'display_name' => 'Updated Name',
            'phone_e164' => '+819022222222',
        ]);
    }

    public function test_account_can_create_update_and_read_user_profile(): void
    {
        $account = Account::factory()->create([
            'public_id' => 'acc_user_profile_api',
            'last_active_role' => 'therapist',
        ]);
        $token = $account->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/me/user-profile')
            ->assertOk()
            ->assertJsonPath('data', null);

        $this->withToken($token)
            ->putJson('/api/me/user-profile', [
                'age_range' => '30s',
                'body_type' => 'average',
                'height_cm' => 172,
                'weight_range' => '70_79',
                'preferences' => [
                    'pressure' => 'normal',
                    'atmosphere' => 'quiet',
                ],
                'touch_ng' => ['face'],
                'health_notes' => '腰に不安あり',
                'sexual_orientation' => 'gay',
                'gender_identity' => 'cis_male',
                'disclose_sensitive_profile_to_therapist' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.profile_status', UserProfile::STATUS_ACTIVE)
            ->assertJsonPath('data.preferences.pressure', 'normal')
            ->assertJsonPath('data.touch_ng.0', 'face')
            ->assertJsonPath('data.health_notes', '腰に不安あり')
            ->assertJsonPath('data.disclose_sensitive_profile_to_therapist', true);

        $this->assertDatabaseHas('account_roles', [
            'account_id' => $account->id,
            'role' => 'user',
            'status' => 'active',
        ]);
        $this->assertDatabaseHas('user_profiles', [
            'account_id' => $account->id,
            'profile_status' => UserProfile::STATUS_ACTIVE,
            'age_range' => '30s',
            'body_type' => 'average',
            'height_cm' => 172,
            'weight_range' => '70_79',
            'sexual_orientation' => 'gay',
            'gender_identity' => 'cis_male',
            'disclose_sensitive_profile_to_therapist' => true,
        ]);
        $this->assertSame('user', $account->fresh()->last_active_role);

        $this->withToken($token)
            ->putJson('/api/me/user-profile', [
                'preferences' => [
                    'pressure' => 'soft',
                ],
                'touch_ng' => ['neck'],
            ])
            ->assertOk()
            ->assertJsonPath('data.profile_status', UserProfile::STATUS_ACTIVE)
            ->assertJsonPath('data.age_range', '30s')
            ->assertJsonPath('data.preferences.pressure', 'soft')
            ->assertJsonPath('data.touch_ng.0', 'neck')
            ->assertJsonPath('data.health_notes', '腰に不安あり');

        $this->withToken($token)
            ->getJson('/api/me/user-profile')
            ->assertOk()
            ->assertJsonPath('data.profile_status', UserProfile::STATUS_ACTIVE)
            ->assertJsonPath('data.gender_identity', 'cis_male');
    }

    public function test_account_can_update_sensitive_disclosure_without_full_profile(): void
    {
        $account = Account::factory()->create(['public_id' => 'acc_sensitive_profile']);
        $token = $account->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->patchJson('/api/me/user-profile/sensitive-disclosure', [
                'disclose_sensitive_profile_to_therapist' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.profile_status', UserProfile::STATUS_INCOMPLETE)
            ->assertJsonPath('data.disclose_sensitive_profile_to_therapist', true);

        $this->assertDatabaseHas('user_profiles', [
            'account_id' => $account->id,
            'profile_status' => UserProfile::STATUS_INCOMPLETE,
            'disclose_sensitive_profile_to_therapist' => true,
        ]);
    }
}
