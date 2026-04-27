<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Booking;
use App\Models\IdentityVerification;
use App\Models\ServiceAddress;
use App\Models\TherapistAvailabilitySlot;
use App\Models\TherapistBookingSetting;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Tests\TestCase;

class ScheduledBookingFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_create_scheduled_quote_and_booking_from_public_slot(): void
    {
        $this->travelTo(CarbonImmutable::parse('2030-01-05 10:00:00'));

        [$user, $serviceAddress] = $this->createUserWithServiceAddress('flow');
        [$profile, $menu, $slot] = $this->createScheduledTherapist($user, 'flow');

        $token = $user->createToken('api')->plainTextToken;
        $requestedStartAt = CarbonImmutable::parse('2030-01-05 14:15:00');
        $requestExpiresAt = CarbonImmutable::parse('2030-01-05 13:15:00');

        $quoteId = $this->withToken($token)
            ->postJson('/api/booking-quotes', [
                'therapist_profile_id' => $profile->public_id,
                'therapist_menu_id' => $menu->public_id,
                'service_address_id' => $serviceAddress->public_id,
                'availability_slot_id' => $slot->public_id,
                'duration_minutes' => 90,
                'is_on_demand' => false,
                'requested_start_at' => $requestedStartAt->toIso8601String(),
            ])
            ->assertCreated()
            ->assertJsonPath('data.is_on_demand', false)
            ->assertJsonPath('data.requested_start_at', $requestedStartAt->toIso8601String())
            ->assertJsonPath('data.availability_slot_id', $slot->public_id)
            ->json('data.quote_id');

        $bookingId = $this->withToken($token)
            ->postJson('/api/bookings', [
                'quote_id' => $quoteId,
            ])
            ->assertCreated()
            ->assertJsonPath('data.status', Booking::STATUS_PAYMENT_AUTHORIZING)
            ->assertJsonPath('data.is_on_demand', false)
            ->assertJsonPath('data.availability_slot_id', $slot->public_id)
            ->assertJsonPath('data.scheduled_start_at', fn (string $value) => CarbonImmutable::parse($value)->equalTo($requestedStartAt))
            ->assertJsonPath('data.scheduled_end_at', fn (string $value) => CarbonImmutable::parse($value)->equalTo($requestedStartAt->addMinutes(90)))
            ->assertJsonPath('data.request_expires_at', fn (string $value) => CarbonImmutable::parse($value)->equalTo($requestExpiresAt))
            ->assertJsonPath('data.buffer_before_minutes', 0)
            ->assertJsonPath('data.buffer_after_minutes', 0)
            ->json('data.public_id');

        $this->assertDatabaseHas('bookings', [
            'public_id' => $bookingId,
            'availability_slot_id' => $slot->id,
            'status' => Booking::STATUS_PAYMENT_AUTHORIZING,
            'is_on_demand' => false,
            'duration_minutes' => 90,
            'request_expires_at' => $requestExpiresAt->toDateTimeString(),
        ]);
    }

    public function test_scheduled_booking_rejects_duplicate_pending_request_for_same_therapist(): void
    {
        $this->travelTo(CarbonImmutable::parse('2030-01-05 10:00:00'));

        [$user, $serviceAddress] = $this->createUserWithServiceAddress('same_therapist');
        [$profile, $menu, $slot] = $this->createScheduledTherapist($user, 'same_therapist');
        $token = $user->createToken('api')->plainTextToken;

        $firstQuoteId = $this->createScheduledQuote(
            token: $token,
            profile: $profile,
            menu: $menu,
            serviceAddress: $serviceAddress,
            slot: $slot,
            requestedStartAt: CarbonImmutable::parse('2030-01-05 14:15:00'),
        );

        $this->withToken($token)
            ->postJson('/api/bookings', ['quote_id' => $firstQuoteId])
            ->assertCreated();

        $secondQuoteId = $this->createScheduledQuote(
            token: $token,
            profile: $profile,
            menu: $menu,
            serviceAddress: $serviceAddress,
            slot: $slot,
            requestedStartAt: CarbonImmutable::parse('2030-01-05 16:00:00'),
        );

        $this->withToken($token)
            ->postJson('/api/bookings', ['quote_id' => $secondQuoteId])
            ->assertConflict()
            ->assertJsonPath('message', 'このセラピストには、すでに承認待ちの予約リクエストがあります。');
    }

    public function test_scheduled_booking_rejects_when_user_has_two_pending_requests(): void
    {
        $this->travelTo(CarbonImmutable::parse('2030-01-05 10:00:00'));

        [$user, $serviceAddress] = $this->createUserWithServiceAddress('global_limit');
        $token = $user->createToken('api')->plainTextToken;

        [$profileA, $menuA, $slotA] = $this->createScheduledTherapist($user, 'limit_a');
        [$profileB, $menuB, $slotB] = $this->createScheduledTherapist($user, 'limit_b');
        [$profileC, $menuC, $slotC] = $this->createScheduledTherapist($user, 'limit_c');

        foreach ([
            [$profileA, $menuA, $slotA, CarbonImmutable::parse('2030-01-05 14:15:00')],
            [$profileB, $menuB, $slotB, CarbonImmutable::parse('2030-01-05 17:15:00')],
        ] as [$profile, $menu, $slot, $requestedStartAt]) {
            $quoteId = $this->createScheduledQuote(
                token: $token,
                profile: $profile,
                menu: $menu,
                serviceAddress: $serviceAddress,
                slot: $slot,
                requestedStartAt: $requestedStartAt,
            );

            $this->withToken($token)
                ->postJson('/api/bookings', ['quote_id' => $quoteId])
                ->assertCreated();
        }

        $thirdQuoteId = $this->createScheduledQuote(
            token: $token,
            profile: $profileC,
            menu: $menuC,
            serviceAddress: $serviceAddress,
            slot: $slotC,
            requestedStartAt: CarbonImmutable::parse('2030-01-05 20:15:00'),
        );

        $this->withToken($token)
            ->postJson('/api/bookings', ['quote_id' => $thirdQuoteId])
            ->assertConflict()
            ->assertJsonPath('message', '承認待ちの予約リクエストは2件までです。');
    }

    public function test_scheduled_booking_rechecks_active_on_demand_block_when_creating_booking(): void
    {
        $this->travelTo(CarbonImmutable::parse('2030-01-05 10:00:00'));

        [$user, $serviceAddress] = $this->createUserWithServiceAddress('ondemand_block');
        [$profile, $menu, $slot] = $this->createScheduledTherapist($user, 'ondemand_block');
        $token = $user->createToken('api')->plainTextToken;

        $quoteId = $this->createScheduledQuote(
            token: $token,
            profile: $profile,
            menu: $menu,
            serviceAddress: $serviceAddress,
            slot: $slot,
            requestedStartAt: CarbonImmutable::parse('2030-01-05 15:00:00'),
        );

        Booking::create([
            'public_id' => 'book_active_ondemand_store',
            'user_account_id' => $user->id,
            'therapist_account_id' => $profile->account_id,
            'therapist_profile_id' => $profile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $serviceAddress->id,
            'status' => Booking::STATUS_ACCEPTED,
            'is_on_demand' => true,
            'requested_start_at' => CarbonImmutable::parse('2030-01-05 10:15:00'),
            'duration_minutes' => 60,
            'accepted_at' => now(),
            'confirmed_at' => now(),
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);

        $this->withToken($token)
            ->postJson('/api/bookings', ['quote_id' => $quoteId])
            ->assertConflict();
    }

    private function createUserWithServiceAddress(string $suffix): array
    {
        $user = Account::factory()->create(['public_id' => "acc_sched_user_{$suffix}"]);

        $serviceAddress = ServiceAddress::create([
            'public_id' => "addr_sched_{$suffix}",
            'account_id' => $user->id,
            'label' => 'Hotel',
            'place_type' => 'hotel',
            'prefecture' => '福岡県',
            'city' => '福岡市中央区',
            'address_line_encrypted' => Crypt::encryptString('Fukuoka Hotel'),
            'lat' => '33.5905000',
            'lng' => '130.4019000',
            'is_default' => true,
        ]);

        return [$user, $serviceAddress];
    }

    private function createScheduledTherapist(Account $viewer, string $suffix): array
    {
        $therapist = Account::factory()->create(['public_id' => "acc_sched_therapist_{$suffix}"]);

        IdentityVerification::create([
            'account_id' => $therapist->id,
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);

        $profile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => "thp_sched_{$suffix}",
            'public_name' => "Scheduled Therapist {$suffix}",
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'photo_review_status' => 'approved',
            'is_online' => false,
        ]);

        $menu = TherapistMenu::create([
            'public_id' => "menu_sched_{$suffix}",
            'therapist_profile_id' => $profile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
            'is_active' => true,
        ]);

        TherapistBookingSetting::create([
            'therapist_profile_id' => $profile->id,
            'booking_request_lead_time_minutes' => 60,
            'scheduled_base_label' => 'Tenjin Base',
            'scheduled_base_lat' => '33.5907000',
            'scheduled_base_lng' => '130.4020000',
        ]);

        $slot = TherapistAvailabilitySlot::create([
            'public_id' => "slot_sched_{$suffix}",
            'therapist_profile_id' => $profile->id,
            'start_at' => CarbonImmutable::parse('2030-01-05 14:00:00'),
            'end_at' => CarbonImmutable::parse('2030-01-05 22:00:00'),
            'status' => TherapistAvailabilitySlot::STATUS_PUBLISHED,
            'dispatch_base_type' => TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_DEFAULT,
            'dispatch_area_label' => '天神周辺',
        ]);

        $this->assertTrue(
            TherapistProfile::query()
                ->scheduledDiscoverableTo($viewer)
                ->whereKey($profile->id)
                ->exists()
        );

        return [$profile, $menu, $slot];
    }

    private function createScheduledQuote(
        string $token,
        TherapistProfile $profile,
        TherapistMenu $menu,
        ServiceAddress $serviceAddress,
        TherapistAvailabilitySlot $slot,
        CarbonImmutable $requestedStartAt,
    ): string {
        return $this->withToken($token)
            ->postJson('/api/booking-quotes', [
                'therapist_profile_id' => $profile->public_id,
                'therapist_menu_id' => $menu->public_id,
                'service_address_id' => $serviceAddress->public_id,
                'availability_slot_id' => $slot->public_id,
                'duration_minutes' => 60,
                'is_on_demand' => false,
                'requested_start_at' => $requestedStartAt->toIso8601String(),
            ])
            ->assertCreated()
            ->json('data.quote_id');
    }
}
