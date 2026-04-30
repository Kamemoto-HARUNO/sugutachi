<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Booking;
use App\Models\Campaign;
use App\Models\CampaignApplication;
use App\Models\IdentityVerification;
use App\Models\LegalDocument;
use App\Models\ServiceAddress;
use App\Models\TherapistLedgerEntry;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CampaignFeatureTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_create_and_update_campaign_with_offer_valid_days(): void
    {
        $admin = $this->createAdminAccount();
        Sanctum::actingAs($admin);

        $campaignId = $this
            ->postJson('/api/admin/campaigns', [
                'target_role' => Campaign::TARGET_USER,
                'trigger_type' => Campaign::TRIGGER_USER_FIRST_BOOKING,
                'benefit_type' => Campaign::BENEFIT_TYPE_FIXED_AMOUNT,
                'benefit_value' => 400,
                'offer_text' => '本人確認後の初回予約が400円オフ',
                'starts_at' => now()->subHour()->toIso8601String(),
                'ends_at' => now()->addDay()->toIso8601String(),
                'offer_valid_days' => 14,
            ])
            ->assertCreated()
            ->assertJsonPath('data.offer_valid_days', 14)
            ->json('data.id');

        $this
            ->patchJson("/api/admin/campaigns/{$campaignId}", [
                'target_role' => Campaign::TARGET_USER,
                'trigger_type' => Campaign::TRIGGER_USER_FIRST_BOOKING,
                'benefit_type' => Campaign::BENEFIT_TYPE_PERCENTAGE,
                'benefit_value' => 10,
                'offer_text' => '本人確認後の初回予約が10%オフ',
                'starts_at' => now()->subHour()->toIso8601String(),
                'ends_at' => now()->addDays(2)->toIso8601String(),
                'offer_valid_days' => 7,
                'is_enabled' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.benefit_summary', '10%割引')
            ->assertJsonPath('data.offer_valid_days', 7);

        $this->assertDatabaseHas('campaigns', [
            'id' => $campaignId,
            'benefit_type' => Campaign::BENEFIT_TYPE_PERCENTAGE,
            'benefit_value' => 10,
            'offer_valid_days' => 7,
        ]);
    }

    public function test_admin_can_delete_campaign_when_applications_count_is_zero(): void
    {
        $admin = $this->createAdminAccount();
        Sanctum::actingAs($admin);

        $campaign = Campaign::create([
            'target_role' => Campaign::TARGET_USER,
            'trigger_type' => Campaign::TRIGGER_USER_BOOKING,
            'benefit_type' => Campaign::BENEFIT_TYPE_FIXED_AMOUNT,
            'benefit_value' => 500,
            'offer_text' => '予約ごとに500円割引',
            'starts_at' => now()->subHour(),
            'ends_at' => now()->addDay(),
            'offer_valid_days' => null,
            'is_enabled' => true,
            'created_by_account_id' => $admin->id,
            'updated_by_account_id' => $admin->id,
        ]);

        $this
            ->deleteJson("/api/admin/campaigns/{$campaign->id}")
            ->assertNoContent();

        $this->assertDatabaseMissing('campaigns', [
            'id' => $campaign->id,
        ]);
    }

    public function test_admin_cannot_delete_campaign_when_applications_exist(): void
    {
        $admin = $this->createAdminAccount();
        $account = Account::factory()->create();
        Sanctum::actingAs($admin);

        $campaign = Campaign::create([
            'target_role' => Campaign::TARGET_USER,
            'trigger_type' => Campaign::TRIGGER_USER_BOOKING,
            'benefit_type' => Campaign::BENEFIT_TYPE_FIXED_AMOUNT,
            'benefit_value' => 500,
            'offer_text' => '予約ごとに500円割引',
            'starts_at' => now()->subHour(),
            'ends_at' => now()->addDay(),
            'offer_valid_days' => null,
            'is_enabled' => true,
            'created_by_account_id' => $admin->id,
            'updated_by_account_id' => $admin->id,
        ]);

        CampaignApplication::create([
            'campaign_id' => $campaign->id,
            'account_id' => $account->id,
            'application_key' => 'user_booking:campaign-delete-test:1',
            'status' => CampaignApplication::STATUS_CONSUMED,
            'benefit_type' => Campaign::BENEFIT_TYPE_FIXED_AMOUNT,
            'benefit_value' => 500,
            'applied_amount' => 500,
            'applied_at' => now(),
            'consumed_at' => now(),
        ]);

        $this
            ->deleteJson("/api/admin/campaigns/{$campaign->id}")
            ->assertStatus(409)
            ->assertJsonPath('message', '適用実績があるキャンペーンは削除できません。');

        $this->assertDatabaseHas('campaigns', [
            'id' => $campaign->id,
        ]);
    }

    public function test_service_meta_returns_active_campaigns(): void
    {
        config()->set('service_meta.name', 'すぐタチ');
        config()->set('service_meta.domain', 'sugutachi.com');
        config()->set('service_meta.base_url', 'https://sugutachi.com');
        config()->set('service_meta.support_email', 'support@sugutachi.com');

        LegalDocument::create([
            'public_id' => 'ldoc_terms_campaign',
            'document_type' => 'terms',
            'version' => '2026-05-01',
            'title' => '利用規約',
            'body' => '本文',
            'published_at' => now()->subDay(),
            'effective_at' => now(),
        ]);
        LegalDocument::create([
            'public_id' => 'ldoc_privacy_campaign',
            'document_type' => 'privacy',
            'version' => '2026-05-01',
            'title' => 'プライバシーポリシー',
            'body' => '本文',
            'published_at' => now()->subDay(),
            'effective_at' => now(),
        ]);

        $admin = $this->createAdminAccount();

        Campaign::create([
            'target_role' => Campaign::TARGET_USER,
            'trigger_type' => Campaign::TRIGGER_USER_BOOKING,
            'benefit_type' => Campaign::BENEFIT_TYPE_FIXED_AMOUNT,
            'benefit_value' => 400,
            'offer_text' => 'いまだけ予約ごとに400円割引',
            'starts_at' => now()->subHour(),
            'ends_at' => now()->addDay(),
            'offer_valid_days' => null,
            'is_enabled' => true,
            'created_by_account_id' => $admin->id,
            'updated_by_account_id' => $admin->id,
        ]);
        Campaign::create([
            'target_role' => Campaign::TARGET_THERAPIST,
            'trigger_type' => Campaign::TRIGGER_THERAPIST_BOOKING,
            'benefit_type' => Campaign::BENEFIT_TYPE_FIXED_AMOUNT,
            'benefit_value' => 2000,
            'offer_text' => '予約確定ごとに2,000円特典',
            'starts_at' => now()->addDay(),
            'ends_at' => now()->addDays(2),
            'offer_valid_days' => null,
            'is_enabled' => true,
            'created_by_account_id' => $admin->id,
            'updated_by_account_id' => $admin->id,
        ]);

        $this->getJson('/api/service-meta')
            ->assertOk()
            ->assertJsonCount(1, 'data.campaigns')
            ->assertJsonPath('data.campaigns.0.trigger_type', Campaign::TRIGGER_USER_BOOKING)
            ->assertJsonPath('data.campaigns.0.offer_text', 'いまだけ予約ごとに400円割引');
    }

    public function test_therapist_registration_campaign_grants_bonus_when_identity_is_approved(): void
    {
        $admin = $this->createAdminAccount();
        Sanctum::actingAs($admin);
        $therapist = Account::factory()->create(['public_id' => 'acc_campaign_therapist']);
        $therapist->roleAssignments()->create([
            'role' => 'therapist',
            'status' => 'active',
            'granted_at' => now()->subMinutes(30),
        ]);

        Campaign::create([
            'target_role' => Campaign::TARGET_THERAPIST,
            'trigger_type' => Campaign::TRIGGER_THERAPIST_REGISTRATION,
            'benefit_type' => Campaign::BENEFIT_TYPE_FIXED_AMOUNT,
            'benefit_value' => 3000,
            'offer_text' => '本人確認完了で3,000円特典',
            'starts_at' => now()->subDay(),
            'ends_at' => now()->addDay(),
            'offer_valid_days' => null,
            'is_enabled' => true,
            'created_by_account_id' => $admin->id,
            'updated_by_account_id' => $admin->id,
        ]);

        $verification = IdentityVerification::create([
            'account_id' => $therapist->id,
            'provider' => 'manual',
            'status' => IdentityVerification::STATUS_PENDING,
            'is_age_verified' => false,
            'self_declared_male' => true,
            'submitted_at' => now()->subHour(),
        ]);

        $this
            ->postJson("/api/admin/identity-verifications/{$verification->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', IdentityVerification::STATUS_APPROVED);

        $this->assertDatabaseHas('therapist_ledger_entries', [
            'therapist_account_id' => $therapist->id,
            'entry_type' => TherapistLedgerEntry::TYPE_CAMPAIGN_BONUS,
            'amount_signed' => 3000,
            'status' => TherapistLedgerEntry::STATUS_AVAILABLE,
        ]);
        $this->assertDatabaseHas('campaign_applications', [
            'account_id' => $therapist->id,
            'status' => CampaignApplication::STATUS_GRANTED,
            'applied_amount' => 3000,
        ]);
    }

    public function test_user_first_booking_offer_is_granted_after_identity_approval_and_visible_in_offers_endpoint(): void
    {
        $admin = $this->createAdminAccount();
        $user = Account::factory()->create(['public_id' => 'acc_campaign_user_pending']);

        $user->roleAssignments()->create([
            'role' => 'user',
            'status' => 'active',
            'granted_at' => now()->subHours(2),
        ]);

        Campaign::create([
            'target_role' => Campaign::TARGET_USER,
            'trigger_type' => Campaign::TRIGGER_USER_FIRST_BOOKING,
            'benefit_type' => Campaign::BENEFIT_TYPE_FIXED_AMOUNT,
            'benefit_value' => 500,
            'offer_text' => '本人確認後の初回予約が500円オフ',
            'starts_at' => now()->subDay(),
            'ends_at' => now()->addDay(),
            'offer_valid_days' => 14,
            'is_enabled' => true,
            'created_by_account_id' => $admin->id,
            'updated_by_account_id' => $admin->id,
        ]);

        $verification = IdentityVerification::create([
            'account_id' => $user->id,
            'provider' => 'manual',
            'status' => IdentityVerification::STATUS_PENDING,
            'is_age_verified' => false,
            'self_declared_male' => true,
            'submitted_at' => now()->subHour(),
        ]);

        Sanctum::actingAs($admin);

        $this
            ->postJson("/api/admin/identity-verifications/{$verification->id}/approve")
            ->assertOk();

        Sanctum::actingAs($user);

        $response = $this
            ->getJson('/api/me/campaign-offers')
            ->assertOk();

        $response
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.status', CampaignApplication::STATUS_AVAILABLE)
            ->assertJsonPath('data.0.offer_valid_days', 14)
            ->assertJsonPath('data.0.offer_text', '本人確認後の初回予約が500円オフ');
    }

    public function test_first_booking_offer_is_reserved_consumed_and_restored_on_cancel(): void
    {
        [$user, $therapist, , , $therapistProfileId, $therapistMenuId, $serviceAddressId] = $this->createBookableFixture();
        $admin = $this->createAdminAccount();

        $campaign = Campaign::create([
            'target_role' => Campaign::TARGET_USER,
            'trigger_type' => Campaign::TRIGGER_USER_FIRST_BOOKING,
            'benefit_type' => Campaign::BENEFIT_TYPE_FIXED_AMOUNT,
            'benefit_value' => 500,
            'offer_text' => '初回予約で500円割引',
            'starts_at' => now()->subDay(),
            'ends_at' => now()->addDay(),
            'offer_valid_days' => 14,
            'is_enabled' => true,
            'created_by_account_id' => $admin->id,
            'updated_by_account_id' => $admin->id,
        ]);

        Sanctum::actingAs($user);

        $quoteId = $this
            ->postJson('/api/booking-quotes', [
                'therapist_profile_id' => $therapistProfileId,
                'therapist_menu_id' => $therapistMenuId,
                'service_address_id' => $serviceAddressId,
                'duration_minutes' => 60,
                'is_on_demand' => true,
            ])
            ->assertCreated()
            ->assertJsonPath('data.amounts.discount_amount', 500)
            ->assertJsonPath('data.amounts.total_amount', 11800)
            ->json('data.quote_id');

        $bookingPublicId = $this
            ->postJson('/api/bookings', [
                'quote_id' => $quoteId,
            ])
            ->assertCreated()
            ->assertJsonPath('data.total_amount', 11800)
            ->assertJsonPath('data.platform_fee_amount', 1200)
            ->assertJsonPath('data.matching_fee_amount', 300)
            ->json('data.public_id');

        $booking = Booking::query()->where('public_id', $bookingPublicId)->firstOrFail();

        $this->assertDatabaseHas('campaign_applications', [
            'campaign_id' => $campaign->id,
            'account_id' => $user->id,
            'booking_id' => $booking->id,
            'status' => CampaignApplication::STATUS_RESERVED,
            'applied_amount' => 500,
        ]);

        Booking::query()->whereKey($booking->id)->update([
            'status' => Booking::STATUS_REQUESTED,
            'request_expires_at' => now()->addMinutes(10),
        ]);

        Sanctum::actingAs($therapist);

        $this
            ->postJson("/api/bookings/{$bookingPublicId}/accept")
            ->assertOk()
            ->assertJsonPath('data.status', Booking::STATUS_ACCEPTED);

        $this->assertDatabaseHas('campaign_applications', [
            'campaign_id' => $campaign->id,
            'account_id' => $user->id,
            'booking_id' => $booking->id,
            'status' => CampaignApplication::STATUS_CONSUMED,
            'applied_amount' => 500,
        ]);

        Sanctum::actingAs($user);

        $this
            ->postJson("/api/bookings/{$bookingPublicId}/cancel", [
                'reason_code' => 'user_changed_mind',
            ])
            ->assertOk()
            ->assertJsonPath('data.booking.status', Booking::STATUS_CANCELED);

        $this->assertDatabaseHas('campaign_applications', [
            'campaign_id' => $campaign->id,
            'account_id' => $user->id,
            'booking_id' => null,
            'status' => CampaignApplication::STATUS_AVAILABLE,
            'applied_amount' => 0,
        ]);

        $this
            ->postJson('/api/booking-quotes', [
                'therapist_profile_id' => $therapistProfileId,
                'therapist_menu_id' => $therapistMenuId,
                'service_address_id' => $serviceAddressId,
                'duration_minutes' => 60,
                'is_on_demand' => true,
            ])
            ->assertCreated()
            ->assertJsonPath('data.amounts.discount_amount', 500);
    }

    public function test_payment_abandon_restores_reserved_first_booking_offer(): void
    {
        [$user, , , , $therapistProfileId, $therapistMenuId, $serviceAddressId] = $this->createBookableFixture();
        $admin = $this->createAdminAccount();

        $campaign = Campaign::create([
            'target_role' => Campaign::TARGET_USER,
            'trigger_type' => Campaign::TRIGGER_USER_FIRST_BOOKING,
            'benefit_type' => Campaign::BENEFIT_TYPE_FIXED_AMOUNT,
            'benefit_value' => 500,
            'offer_text' => '初回予約で500円割引',
            'starts_at' => now()->subDay(),
            'ends_at' => now()->addDay(),
            'offer_valid_days' => 14,
            'is_enabled' => true,
            'created_by_account_id' => $admin->id,
            'updated_by_account_id' => $admin->id,
        ]);

        Sanctum::actingAs($user);

        $quoteId = $this
            ->postJson('/api/booking-quotes', [
                'therapist_profile_id' => $therapistProfileId,
                'therapist_menu_id' => $therapistMenuId,
                'service_address_id' => $serviceAddressId,
                'duration_minutes' => 60,
                'is_on_demand' => true,
            ])
            ->assertCreated()
            ->json('data.quote_id');

        $bookingPublicId = $this
            ->postJson('/api/bookings', [
                'quote_id' => $quoteId,
            ])
            ->assertCreated()
            ->json('data.public_id');

        $booking = Booking::query()->where('public_id', $bookingPublicId)->firstOrFail();

        $this->assertDatabaseHas('campaign_applications', [
            'campaign_id' => $campaign->id,
            'account_id' => $user->id,
            'booking_id' => $booking->id,
            'status' => CampaignApplication::STATUS_RESERVED,
        ]);

        $this
            ->postJson("/api/bookings/{$bookingPublicId}/payment-abandon")
            ->assertOk()
            ->assertJsonPath('data.status', Booking::STATUS_PAYMENT_CANCELED);

        $this->assertDatabaseHas('campaign_applications', [
            'campaign_id' => $campaign->id,
            'account_id' => $user->id,
            'booking_id' => null,
            'status' => CampaignApplication::STATUS_AVAILABLE,
            'applied_amount' => 0,
        ]);
    }

    public function test_first_booking_offer_expires_based_on_offer_valid_days(): void
    {
        [$user, , , , $therapistProfileId, $therapistMenuId, $serviceAddressId] = $this->createBookableFixture(
            verificationReviewedAt: now()->subDays(2),
        );
        $admin = $this->createAdminAccount();

        Campaign::create([
            'target_role' => Campaign::TARGET_USER,
            'trigger_type' => Campaign::TRIGGER_USER_FIRST_BOOKING,
            'benefit_type' => Campaign::BENEFIT_TYPE_FIXED_AMOUNT,
            'benefit_value' => 500,
            'offer_text' => '初回予約で500円割引',
            'starts_at' => now()->subDay(),
            'ends_at' => now()->addDay(),
            'offer_valid_days' => 1,
            'is_enabled' => true,
            'created_by_account_id' => $admin->id,
            'updated_by_account_id' => $admin->id,
        ]);

        Sanctum::actingAs($user);

        $this
            ->getJson('/api/me/campaign-offers')
            ->assertOk()
            ->assertJsonPath('data.0.status', CampaignApplication::STATUS_EXPIRED);

        $this
            ->postJson('/api/booking-quotes', [
                'therapist_profile_id' => $therapistProfileId,
                'therapist_menu_id' => $therapistMenuId,
                'service_address_id' => $serviceAddressId,
                'duration_minutes' => 60,
                'is_on_demand' => true,
            ])
            ->assertCreated()
            ->assertJsonPath('data.amounts.discount_amount', 0)
            ->assertJsonPath('data.amounts.total_amount', 12300);
    }

    public function test_platform_funded_discount_keeps_therapist_net_unchanged(): void
    {
        [$user, , , , $therapistProfileId, $therapistMenuId, $serviceAddressId] = $this->createBookableFixture();
        $admin = $this->createAdminAccount();

        Campaign::create([
            'target_role' => Campaign::TARGET_USER,
            'trigger_type' => Campaign::TRIGGER_USER_BOOKING,
            'benefit_type' => Campaign::BENEFIT_TYPE_FIXED_AMOUNT,
            'benefit_value' => 1700,
            'offer_text' => '期間中は予約ごとに1,700円割引',
            'starts_at' => now()->subHour(),
            'ends_at' => now()->addDay(),
            'offer_valid_days' => null,
            'is_enabled' => true,
            'created_by_account_id' => $admin->id,
            'updated_by_account_id' => $admin->id,
        ]);

        Sanctum::actingAs($user);

        $this
            ->postJson('/api/booking-quotes', [
                'therapist_profile_id' => $therapistProfileId,
                'therapist_menu_id' => $therapistMenuId,
                'service_address_id' => $serviceAddressId,
                'duration_minutes' => 60,
                'is_on_demand' => true,
            ])
            ->assertCreated()
            ->assertJsonPath('data.amounts.discount_amount', 1700)
            ->assertJsonPath('data.amounts.total_amount', 10600)
            ->assertJsonPath('data.amounts.therapist_net_amount', 10800)
            ->assertJsonPath('data.amounts.matching_fee_amount', 300)
            ->assertJsonPath('data.amounts.platform_fee_amount', 1200);
    }

    public function test_active_user_booking_campaign_applies_even_after_previous_booking_history_exists(): void
    {
        [$user, , , , $therapistProfileId, $therapistMenuId, $serviceAddressId] = $this->createBookableFixture();
        $admin = $this->createAdminAccount();

        Booking::create([
            'public_id' => 'book_previous_user_history',
            'user_account_id' => $user->id,
            'therapist_account_id' => Account::factory()->create()->id,
            'therapist_profile_id' => TherapistProfile::query()->where('public_id', $therapistProfileId)->value('id'),
            'therapist_menu_id' => TherapistMenu::query()->where('public_id', $therapistMenuId)->value('id'),
            'service_address_id' => ServiceAddress::query()->where('public_id', $serviceAddressId)->value('id'),
            'status' => Booking::STATUS_COMPLETED,
            'is_on_demand' => true,
            'duration_minutes' => 60,
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
            'completed_at' => now()->subDay(),
        ]);

        Campaign::create([
            'target_role' => Campaign::TARGET_USER,
            'trigger_type' => Campaign::TRIGGER_USER_BOOKING,
            'benefit_type' => Campaign::BENEFIT_TYPE_FIXED_AMOUNT,
            'benefit_value' => 400,
            'offer_text' => '期間中は予約ごとに400円割引',
            'starts_at' => now()->subHour(),
            'ends_at' => now()->addDay(),
            'offer_valid_days' => null,
            'is_enabled' => true,
            'created_by_account_id' => $admin->id,
            'updated_by_account_id' => $admin->id,
        ]);

        Sanctum::actingAs($user);

        $this
            ->postJson('/api/booking-quotes', [
                'therapist_profile_id' => $therapistProfileId,
                'therapist_menu_id' => $therapistMenuId,
                'service_address_id' => $serviceAddressId,
                'duration_minutes' => 60,
                'is_on_demand' => true,
            ])
            ->assertCreated()
            ->assertJsonPath('data.amounts.discount_amount', 400)
            ->assertJsonPath('data.amounts.total_amount', 11900)
            ->assertJsonPath('data.discount.trigger_type', Campaign::TRIGGER_USER_BOOKING);
    }

    public function test_therapist_booking_campaign_grants_bonus_when_booking_is_accepted(): void
    {
        [$user, $therapist, , , $therapistProfileId, $therapistMenuId, $serviceAddressId] = $this->createBookableFixture();
        $admin = $this->createAdminAccount();

        Campaign::create([
            'target_role' => Campaign::TARGET_THERAPIST,
            'trigger_type' => Campaign::TRIGGER_THERAPIST_BOOKING,
            'benefit_type' => Campaign::BENEFIT_TYPE_FIXED_AMOUNT,
            'benefit_value' => 2000,
            'offer_text' => '予約確定ごとに2,000円付与',
            'starts_at' => now()->subHour(),
            'ends_at' => now()->addDay(),
            'offer_valid_days' => null,
            'is_enabled' => true,
            'created_by_account_id' => $admin->id,
            'updated_by_account_id' => $admin->id,
        ]);

        Sanctum::actingAs($user);

        $quoteId = $this
            ->postJson('/api/booking-quotes', [
                'therapist_profile_id' => $therapistProfileId,
                'therapist_menu_id' => $therapistMenuId,
                'service_address_id' => $serviceAddressId,
                'duration_minutes' => 60,
                'is_on_demand' => true,
            ])
            ->assertCreated()
            ->json('data.quote_id');

        $bookingId = $this
            ->postJson('/api/bookings', [
                'quote_id' => $quoteId,
            ])
            ->assertCreated()
            ->json('data.public_id');

        Booking::query()->where('public_id', $bookingId)->update([
            'status' => Booking::STATUS_REQUESTED,
            'request_expires_at' => now()->addMinutes(10),
        ]);

        Sanctum::actingAs($therapist);

        $this
            ->postJson("/api/bookings/{$bookingId}/accept")
            ->assertOk()
            ->assertJsonPath('data.status', Booking::STATUS_ACCEPTED);

        $booking = Booking::query()->where('public_id', $bookingId)->firstOrFail();

        $this->assertDatabaseHas('therapist_ledger_entries', [
            'therapist_account_id' => $therapist->id,
            'booking_id' => $booking->id,
            'entry_type' => TherapistLedgerEntry::TYPE_CAMPAIGN_BONUS,
            'amount_signed' => 2000,
        ]);
        $this->assertDatabaseHas('campaign_applications', [
            'account_id' => $therapist->id,
            'booking_id' => $booking->id,
            'status' => CampaignApplication::STATUS_GRANTED,
            'applied_amount' => 2000,
        ]);
    }

    private function createAdminAccount(): Account
    {
        $admin = Account::factory()->create(['public_id' => 'acc_campaign_admin']);
        $admin->roleAssignments()->create([
            'role' => 'admin',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        return $admin;
    }

    private function createBookableFixture(?\Carbon\CarbonInterface $verificationReviewedAt = null): array
    {
        $verificationReviewedAt ??= now()->subDay();

        $user = Account::factory()->create(['public_id' => 'acc_campaign_user']);
        $therapist = Account::factory()->create(['public_id' => 'acc_campaign_therapist_profile']);
        $userToken = $user->createToken('api')->plainTextToken;
        $therapistToken = $therapist->createToken('api')->plainTextToken;

        $user->roleAssignments()->create([
            'role' => 'user',
            'status' => 'active',
            'granted_at' => now()->subHour(),
        ]);
        $therapist->roleAssignments()->create([
            'role' => 'therapist',
            'status' => 'active',
            'granted_at' => now()->subHour(),
        ]);

        IdentityVerification::create([
            'account_id' => $user->id,
            'provider' => 'manual',
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'self_declared_male' => true,
            'submitted_at' => $verificationReviewedAt->copy()->subHour(),
            'reviewed_at' => $verificationReviewedAt,
        ]);
        IdentityVerification::create([
            'account_id' => $therapist->id,
            'provider' => 'manual',
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'self_declared_male' => true,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now()->subDay(),
        ]);

        $therapistProfile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_campaign_quote',
            'public_name' => 'Campaign Therapist',
            'bio' => 'Relaxation focused body care.',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'photo_review_status' => 'approved',
            'is_online' => true,
            'online_since' => now()->subMinutes(5),
            'approved_at' => now()->subDay(),
        ]);
        $therapistMenu = TherapistMenu::create([
            'public_id' => 'menu_campaign_quote_60',
            'therapist_profile_id' => $therapistProfile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
            'is_active' => true,
        ]);
        $therapistProfile->location()->create([
            'lat' => 35.681236,
            'lng' => 139.767125,
            'accuracy_m' => 30,
            'source' => 'test',
            'is_searchable' => true,
        ]);

        $serviceAddressId = ServiceAddress::create([
            'public_id' => 'addr_campaign_quote',
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

        return [
            $user,
            $therapist,
            $userToken,
            $therapistToken,
            $therapistProfile->public_id,
            $therapistMenu->public_id,
            $serviceAddressId,
        ];
    }
}
