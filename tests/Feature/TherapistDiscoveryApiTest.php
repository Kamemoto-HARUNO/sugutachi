<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\AccountBlock;
use App\Models\IdentityVerification;
use App\Models\ProfilePhoto;
use App\Models\ServiceAddress;
use App\Models\TherapistLocation;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Tests\TestCase;

class TherapistDiscoveryApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_search_discoverable_therapists_and_logs_search(): void
    {
        [$user, $address, $nearbyProfile, $farProfile] = $this->createDiscoveryFixture();

        $this->withToken($user->createToken('api')->plainTextToken)
            ->getJson("/api/therapists?service_address_id={$address->public_id}&menu_duration_minutes=60&sort=recommended")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.public_id', $nearbyProfile->public_id)
            ->assertJsonPath('data.0.therapist_cancellation_count', 1)
            ->assertJsonPath('data.0.walking_time_range', 'within_15_min')
            ->assertJsonPath('data.0.estimated_total_amount', 10300)
            ->assertJsonPath('data.1.public_id', $farProfile->public_id)
            ->assertJsonPath('data.1.therapist_cancellation_count', 3)
            ->assertJsonPath('data.1.walking_time_range', 'within_60_min')
            ->assertJsonPath('data.1.estimated_total_amount', 13300)
            ->assertJsonStructure([
                'data' => [
                    [
                        'public_id',
                        'public_name',
                        'bio_excerpt',
                        'training_status',
                        'rating_average',
                        'review_count',
                        'therapist_cancellation_count',
                        'walking_time_range',
                        'estimated_total_amount',
                        'photos' => [
                            ['sort_order', 'url'],
                        ],
                    ],
                ],
            ]);

        $this->assertDatabaseHas('location_search_logs', [
            'account_id' => $user->id,
            'result_count' => 2,
        ]);
    }

    public function test_user_can_sort_therapists_by_rating(): void
    {
        [$user, $address, $nearbyProfile, $farProfile] = $this->createDiscoveryFixture();

        $this->withToken($user->createToken('api')->plainTextToken)
            ->getJson("/api/therapists?service_address_id={$address->public_id}&menu_duration_minutes=60&sort=rating")
            ->assertOk()
            ->assertJsonPath('data.0.public_id', $farProfile->public_id)
            ->assertJsonPath('data.1.public_id', $nearbyProfile->public_id);
    }

    public function test_user_can_view_therapist_detail_with_menu_estimates(): void
    {
        [$user, $address, $nearbyProfile] = $this->createDiscoveryFixture();
        $scheduledStartAt = urlencode('2030-01-01 23:30:00');

        $this->withToken($user->createToken('api')->plainTextToken)
            ->getJson("/api/therapists/{$nearbyProfile->public_id}?service_address_id={$address->public_id}&menu_duration_minutes=90&start_type=scheduled&scheduled_start_at={$scheduledStartAt}")
            ->assertOk()
            ->assertJsonPath('data.public_id', $nearbyProfile->public_id)
            ->assertJsonPath('data.therapist_cancellation_count', 1)
            ->assertJsonPath('data.walking_time_range', 'within_15_min')
            ->assertJsonPath('data.lowest_estimated_total_amount', 16300)
            ->assertJsonPath('data.menus.0.public_id', 'menu_near_90')
            ->assertJsonPath('data.menus.0.estimated_total_amount', 16300)
            ->assertJsonPath('data.menus.1.public_id', 'menu_near_60')
            ->assertJsonPath('data.menus.1.estimated_total_amount', 19300)
            ->assertJsonCount(1, 'data.photos');
    }

    public function test_blocked_or_unverified_therapists_are_hidden(): void
    {
        [$user, $address, $nearbyProfile] = $this->createDiscoveryFixture();

        $blockedTherapist = Account::factory()->create(['public_id' => 'acc_therapist_blocked']);
        $blockedProfile = TherapistProfile::create([
            'account_id' => $blockedTherapist->id,
            'public_id' => 'thp_blocked',
            'public_name' => 'Blocked Therapist',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'is_online' => true,
        ]);
        TherapistMenu::create([
            'public_id' => 'menu_blocked_60',
            'therapist_profile_id' => $blockedProfile->id,
            'name' => 'Blocked Body Care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
            'is_active' => true,
        ]);
        TherapistLocation::create([
            'therapist_profile_id' => $blockedProfile->id,
            'lat' => '35.6825000',
            'lng' => '139.7685000',
            'is_searchable' => true,
        ]);
        IdentityVerification::create([
            'account_id' => $blockedTherapist->id,
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);
        AccountBlock::create([
            'blocker_account_id' => $user->id,
            'blocked_account_id' => $blockedTherapist->id,
            'reason_code' => 'unsafe',
        ]);

        $unverifiedTherapist = Account::factory()->create(['public_id' => 'acc_therapist_unverified']);
        $unverifiedProfile = TherapistProfile::create([
            'account_id' => $unverifiedTherapist->id,
            'public_id' => 'thp_unverified',
            'public_name' => 'Unverified Therapist',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'is_online' => true,
        ]);
        TherapistMenu::create([
            'public_id' => 'menu_unverified_60',
            'therapist_profile_id' => $unverifiedProfile->id,
            'name' => 'Unverified Body Care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
            'is_active' => true,
        ]);
        TherapistLocation::create([
            'therapist_profile_id' => $unverifiedProfile->id,
            'lat' => '35.6830000',
            'lng' => '139.7690000',
            'is_searchable' => true,
        ]);
        IdentityVerification::create([
            'account_id' => $unverifiedTherapist->id,
            'status' => IdentityVerification::STATUS_REJECTED,
            'is_age_verified' => false,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->getJson("/api/therapists?service_address_id={$address->public_id}")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.public_id', $nearbyProfile->public_id);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->getJson("/api/therapists/{$blockedProfile->public_id}?service_address_id={$address->public_id}")
            ->assertNotFound();
    }

    private function createDiscoveryFixture(): array
    {
        $user = Account::factory()->create(['public_id' => 'acc_discovery_user']);
        $address = ServiceAddress::create([
            'public_id' => 'addr_discovery',
            'account_id' => $user->id,
            'place_type' => 'hotel',
            'prefecture' => 'Tokyo',
            'city' => 'Chiyoda',
            'address_line_encrypted' => Crypt::encryptString('Tokyo Station Hotel'),
            'lat' => '35.6812360',
            'lng' => '139.7671250',
            'is_default' => true,
        ]);

        $nearbyTherapist = Account::factory()->create(['public_id' => 'acc_therapist_near']);
        $nearbyProfile = TherapistProfile::create([
            'account_id' => $nearbyTherapist->id,
            'public_id' => 'thp_near',
            'public_name' => 'Nearby Therapist',
            'bio' => '落ち着いたボディケアを中心に、丁寧なリラクゼーションを提供します。',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'is_online' => true,
            'rating_average' => 4.50,
            'review_count' => 8,
            'therapist_cancellation_count' => 1,
        ]);
        TherapistMenu::create([
            'public_id' => 'menu_near_90',
            'therapist_profile_id' => $nearbyProfile->id,
            'name' => 'Body Care 90',
            'duration_minutes' => 90,
            'base_price_amount' => 15000,
            'is_active' => true,
            'sort_order' => 0,
        ]);
        TherapistMenu::create([
            'public_id' => 'menu_near_60',
            'therapist_profile_id' => $nearbyProfile->id,
            'name' => 'Body Care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
            'is_active' => true,
            'sort_order' => 1,
        ]);
        TherapistLocation::create([
            'therapist_profile_id' => $nearbyProfile->id,
            'lat' => '35.6820000',
            'lng' => '139.7680000',
            'is_searchable' => true,
        ]);
        IdentityVerification::create([
            'account_id' => $nearbyTherapist->id,
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);
        ProfilePhoto::create([
            'account_id' => $nearbyTherapist->id,
            'therapist_profile_id' => $nearbyProfile->id,
            'usage_type' => 'therapist_profile',
            'storage_key_encrypted' => Crypt::encryptString('profiles/near.jpg'),
            'status' => ProfilePhoto::STATUS_APPROVED,
            'sort_order' => 0,
        ]);

        $farTherapist = Account::factory()->create(['public_id' => 'acc_therapist_far']);
        $farProfile = TherapistProfile::create([
            'account_id' => $farTherapist->id,
            'public_id' => 'thp_far',
            'public_name' => 'Far Therapist',
            'bio' => '遠方でも対応できる落ち着いた施術スタイルです。',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'is_online' => true,
            'rating_average' => 4.90,
            'review_count' => 22,
            'therapist_cancellation_count' => 3,
        ]);
        TherapistMenu::create([
            'public_id' => 'menu_far_60',
            'therapist_profile_id' => $farProfile->id,
            'name' => 'Far Body Care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
            'is_active' => true,
            'sort_order' => 0,
        ]);
        TherapistLocation::create([
            'therapist_profile_id' => $farProfile->id,
            'lat' => '35.6900000',
            'lng' => '139.7850000',
            'is_searchable' => true,
        ]);
        IdentityVerification::create([
            'account_id' => $farTherapist->id,
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);

        $offlineTherapist = Account::factory()->create(['public_id' => 'acc_therapist_offline']);
        $offlineProfile = TherapistProfile::create([
            'account_id' => $offlineTherapist->id,
            'public_id' => 'thp_offline',
            'public_name' => 'Offline Therapist',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'is_online' => false,
        ]);
        TherapistMenu::create([
            'public_id' => 'menu_offline_60',
            'therapist_profile_id' => $offlineProfile->id,
            'name' => 'Offline Body Care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
            'is_active' => true,
        ]);
        TherapistLocation::create([
            'therapist_profile_id' => $offlineProfile->id,
            'lat' => '35.6821000',
            'lng' => '139.7681000',
            'is_searchable' => true,
        ]);
        IdentityVerification::create([
            'account_id' => $offlineTherapist->id,
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);

        return [$user, $address, $nearbyProfile, $farProfile];
    }
}
