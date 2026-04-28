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

class PublicTherapistAvailabilityApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_get_public_availability_for_offline_scheduled_therapist(): void
    {
        [$user, $serviceAddress, $profile, $menu] = $this->createAvailabilityFixture();

        $defaultSlot = TherapistAvailabilitySlot::create([
            'public_id' => 'slot_public_default',
            'therapist_profile_id' => $profile->id,
            'start_at' => CarbonImmutable::parse('2030-01-05 14:00:00'),
            'end_at' => CarbonImmutable::parse('2030-01-05 18:00:00'),
            'status' => TherapistAvailabilitySlot::STATUS_PUBLISHED,
            'dispatch_base_type' => TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_DEFAULT,
            'dispatch_area_label' => '天神周辺',
        ]);

        $customSlot = TherapistAvailabilitySlot::create([
            'public_id' => 'slot_public_custom',
            'therapist_profile_id' => $profile->id,
            'start_at' => CarbonImmutable::parse('2030-01-05 19:00:00'),
            'end_at' => CarbonImmutable::parse('2030-01-05 21:00:00'),
            'status' => TherapistAvailabilitySlot::STATUS_PUBLISHED,
            'dispatch_base_type' => TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_CUSTOM,
            'dispatch_area_label' => '博多駅周辺',
            'custom_dispatch_base_label' => 'Hakata',
            'custom_dispatch_base_lat' => '33.5790000',
            'custom_dispatch_base_lng' => '130.4200000',
        ]);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->getJson("/api/therapists/{$profile->public_id}/availability?service_address_id={$serviceAddress->public_id}&therapist_menu_id={$menu->public_id}&date=2030-01-05")
            ->assertOk()
            ->assertJsonPath('data.date', '2030-01-05')
            ->assertJsonPath('data.walking_time_range', 'within_15_min')
            ->assertJsonPath('data.estimated_total_amount_range.min', 12300)
            ->assertJsonPath('data.estimated_total_amount_range.max', 13300)
            ->assertJsonCount(1, 'data.available_dates')
            ->assertJsonPath('data.available_dates.0.date', '2030-01-05')
            ->assertJsonPath('data.available_dates.0.earliest_start_at', $defaultSlot->start_at->toJSON())
            ->assertJsonPath('data.available_dates.0.latest_end_at', $customSlot->end_at->toJSON())
            ->assertJsonPath('data.available_dates.0.window_count', 2)
            ->assertJsonPath('data.available_dates.0.bookable_window_count', 2)
            ->assertJsonPath('data.available_dates.0.is_bookable', true)
            ->assertJsonPath('data.available_dates.0.unavailable_reason', null)
            ->assertJsonCount(2, 'data.windows')
            ->assertJsonPath('data.windows.0.availability_slot_id', $defaultSlot->public_id)
            ->assertJsonPath('data.windows.0.slot_start_at', $defaultSlot->start_at->toJSON())
            ->assertJsonPath('data.windows.0.slot_end_at', $defaultSlot->end_at->toJSON())
            ->assertJsonPath('data.windows.0.start_at', $defaultSlot->start_at->toJSON())
            ->assertJsonPath('data.windows.0.end_at', $defaultSlot->end_at->toJSON())
            ->assertJsonPath('data.windows.0.dispatch_area_label', '天神周辺')
            ->assertJsonPath('data.windows.0.is_bookable', true)
            ->assertJsonPath('data.windows.0.unavailable_reason', null)
            ->assertJsonPath('data.windows.1.availability_slot_id', $customSlot->public_id)
            ->assertJsonPath('data.windows.1.slot_start_at', $customSlot->start_at->toJSON())
            ->assertJsonPath('data.windows.1.slot_end_at', $customSlot->end_at->toJSON())
            ->assertJsonPath('data.windows.1.start_at', $customSlot->start_at->toJSON())
            ->assertJsonPath('data.windows.1.end_at', $customSlot->end_at->toJSON())
            ->assertJsonPath('data.windows.1.dispatch_area_label', '博多駅周辺')
            ->assertJsonPath('data.windows.1.is_bookable', true)
            ->assertJsonPath('data.windows.1.unavailable_reason', null);
    }

    public function test_public_availability_excludes_hidden_outside_area_and_conflicted_time(): void
    {
        [$user, $serviceAddress, $profile, $menu] = $this->createAvailabilityFixture();
        $requester = Account::factory()->create(['public_id' => 'acc_slot_requester']);

        $publishedSlot = TherapistAvailabilitySlot::create([
            'public_id' => 'slot_public_split',
            'therapist_profile_id' => $profile->id,
            'start_at' => CarbonImmutable::parse('2030-01-05 14:00:00'),
            'end_at' => CarbonImmutable::parse('2030-01-05 18:00:00'),
            'status' => TherapistAvailabilitySlot::STATUS_PUBLISHED,
            'dispatch_base_type' => TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_DEFAULT,
            'dispatch_area_label' => '天神周辺',
        ]);

        TherapistAvailabilitySlot::create([
            'public_id' => 'slot_public_hidden',
            'therapist_profile_id' => $profile->id,
            'start_at' => CarbonImmutable::parse('2030-01-05 18:00:00'),
            'end_at' => CarbonImmutable::parse('2030-01-05 20:00:00'),
            'status' => TherapistAvailabilitySlot::STATUS_HIDDEN,
            'dispatch_base_type' => TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_DEFAULT,
            'dispatch_area_label' => '非公開',
        ]);

        TherapistAvailabilitySlot::create([
            'public_id' => 'slot_public_outside',
            'therapist_profile_id' => $profile->id,
            'start_at' => CarbonImmutable::parse('2030-01-05 20:00:00'),
            'end_at' => CarbonImmutable::parse('2030-01-05 22:00:00'),
            'status' => TherapistAvailabilitySlot::STATUS_PUBLISHED,
            'dispatch_base_type' => TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_CUSTOM,
            'dispatch_area_label' => '遠方エリア',
            'custom_dispatch_base_label' => 'Outside',
            'custom_dispatch_base_lat' => '34.5000000',
            'custom_dispatch_base_lng' => '135.5000000',
        ]);

        Booking::create([
            'public_id' => 'book_slot_conflict',
            'user_account_id' => $requester->id,
            'therapist_account_id' => $profile->account_id,
            'therapist_profile_id' => $profile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $serviceAddress->id,
            'availability_slot_id' => $publishedSlot->id,
            'status' => Booking::STATUS_REQUESTED,
            'is_on_demand' => false,
            'requested_start_at' => CarbonImmutable::parse('2030-01-05 15:00:00'),
            'scheduled_start_at' => CarbonImmutable::parse('2030-01-05 15:00:00'),
            'scheduled_end_at' => CarbonImmutable::parse('2030-01-05 16:00:00'),
            'duration_minutes' => 60,
            'request_expires_at' => CarbonImmutable::parse('2030-01-05 12:00:00'),
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->getJson("/api/therapists/{$profile->public_id}/availability?service_address_id={$serviceAddress->public_id}&therapist_menu_id={$menu->public_id}&date=2030-01-05")
            ->assertOk()
            ->assertJsonPath('data.estimated_total_amount_range.min', 12300)
            ->assertJsonPath('data.estimated_total_amount_range.max', 12300)
            ->assertJsonCount(1, 'data.available_dates')
            ->assertJsonPath('data.available_dates.0.date', '2030-01-05')
            ->assertJsonPath('data.available_dates.0.earliest_start_at', CarbonImmutable::parse('2030-01-05 14:00:00')->toJSON())
            ->assertJsonPath('data.available_dates.0.latest_end_at', CarbonImmutable::parse('2030-01-05 22:00:00')->toJSON())
            ->assertJsonPath('data.available_dates.0.window_count', 3)
            ->assertJsonPath('data.available_dates.0.bookable_window_count', 2)
            ->assertJsonPath('data.available_dates.0.is_bookable', true)
            ->assertJsonPath('data.available_dates.0.unavailable_reason', null)
            ->assertJsonCount(3, 'data.windows')
            ->assertJsonPath('data.windows.0.availability_slot_id', $publishedSlot->public_id)
            ->assertJsonPath('data.windows.0.slot_start_at', $publishedSlot->start_at->toJSON())
            ->assertJsonPath('data.windows.0.slot_end_at', $publishedSlot->end_at->toJSON())
            ->assertJsonPath('data.windows.0.start_at', CarbonImmutable::parse('2030-01-05 14:00:00')->toJSON())
            ->assertJsonPath('data.windows.0.end_at', CarbonImmutable::parse('2030-01-05 15:00:00')->toJSON())
            ->assertJsonPath('data.windows.0.booking_deadline_at', CarbonImmutable::parse('2030-01-05 13:00:00')->toJSON())
            ->assertJsonPath('data.windows.0.is_bookable', true)
            ->assertJsonPath('data.windows.1.availability_slot_id', $publishedSlot->public_id)
            ->assertJsonPath('data.windows.1.slot_start_at', $publishedSlot->start_at->toJSON())
            ->assertJsonPath('data.windows.1.slot_end_at', $publishedSlot->end_at->toJSON())
            ->assertJsonPath('data.windows.1.start_at', CarbonImmutable::parse('2030-01-05 16:00:00')->toJSON())
            ->assertJsonPath('data.windows.1.end_at', CarbonImmutable::parse('2030-01-05 18:00:00')->toJSON())
            ->assertJsonPath('data.windows.1.is_bookable', true)
            ->assertJsonPath('data.windows.2.availability_slot_id', 'slot_public_outside')
            ->assertJsonPath('data.windows.2.start_at', CarbonImmutable::parse('2030-01-05 20:00:00')->toJSON())
            ->assertJsonPath('data.windows.2.end_at', CarbonImmutable::parse('2030-01-05 22:00:00')->toJSON())
            ->assertJsonPath('data.windows.2.is_bookable', false)
            ->assertJsonPath('data.windows.2.unavailable_reason', 'outside_service_area');
    }

    public function test_public_availability_respects_active_on_demand_block_window(): void
    {
        $this->travelTo(CarbonImmutable::parse('2030-01-05 10:20:00'));

        [$user, $serviceAddress, $profile, $menu] = $this->createAvailabilityFixture();

        TherapistAvailabilitySlot::create([
            'public_id' => 'slot_public_blocked',
            'therapist_profile_id' => $profile->id,
            'start_at' => CarbonImmutable::parse('2030-01-05 11:00:00'),
            'end_at' => CarbonImmutable::parse('2030-01-05 18:00:00'),
            'status' => TherapistAvailabilitySlot::STATUS_PUBLISHED,
            'dispatch_base_type' => TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_DEFAULT,
            'dispatch_area_label' => '天神周辺',
        ]);

        Booking::create([
            'public_id' => 'book_active_ondemand',
            'user_account_id' => $user->id,
            'therapist_account_id' => $profile->account_id,
            'therapist_profile_id' => $profile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $serviceAddress->id,
            'status' => Booking::STATUS_ACCEPTED,
            'is_on_demand' => true,
            'requested_start_at' => CarbonImmutable::parse('2030-01-05 10:30:00'),
            'duration_minutes' => 60,
            'accepted_at' => CarbonImmutable::parse('2030-01-05 10:20:00'),
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->getJson("/api/therapists/{$profile->public_id}/availability?service_address_id={$serviceAddress->public_id}&therapist_menu_id={$menu->public_id}&date=2030-01-05")
            ->assertOk()
            ->assertJsonCount(1, 'data.available_dates')
            ->assertJsonPath('data.available_dates.0.date', '2030-01-05')
            ->assertJsonPath('data.available_dates.0.earliest_start_at', CarbonImmutable::parse('2030-01-05 16:30:00')->toJSON())
            ->assertJsonPath('data.available_dates.0.latest_end_at', CarbonImmutable::parse('2030-01-05 18:00:00')->toJSON())
            ->assertJsonPath('data.available_dates.0.window_count', 1)
            ->assertJsonPath('data.available_dates.0.bookable_window_count', 1)
            ->assertJsonPath('data.available_dates.0.is_bookable', true)
            ->assertJsonCount(1, 'data.windows')
            ->assertJsonPath('data.windows.0.availability_slot_id', 'slot_public_blocked')
            ->assertJsonPath('data.windows.0.slot_start_at', CarbonImmutable::parse('2030-01-05 11:00:00')->toJSON())
            ->assertJsonPath('data.windows.0.slot_end_at', CarbonImmutable::parse('2030-01-05 18:00:00')->toJSON())
            ->assertJsonPath('data.windows.0.start_at', CarbonImmutable::parse('2030-01-05 16:30:00')->toJSON())
            ->assertJsonPath('data.windows.0.end_at', CarbonImmutable::parse('2030-01-05 18:00:00')->toJSON())
            ->assertJsonPath('data.windows.0.booking_deadline_at', CarbonImmutable::parse('2030-01-05 15:30:00')->toJSON())
            ->assertJsonPath('data.windows.0.is_bookable', true);
    }

    public function test_public_availability_respects_travel_mode_and_extended_service_range(): void
    {
        [$user, $serviceAddress, $profile, $menu] = $this->createAvailabilityFixture();

        $profile->bookingSetting()->update([
            'travel_mode' => 'car',
            'max_travel_minutes' => 120,
        ]);

        TherapistAvailabilitySlot::create([
            'public_id' => 'slot_public_car_range',
            'therapist_profile_id' => $profile->id,
            'start_at' => CarbonImmutable::parse('2030-01-05 12:00:00'),
            'end_at' => CarbonImmutable::parse('2030-01-05 16:00:00'),
            'status' => TherapistAvailabilitySlot::STATUS_PUBLISHED,
            'dispatch_base_type' => TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_CUSTOM,
            'dispatch_area_label' => '広域対応',
            'custom_dispatch_base_label' => 'Car Base',
            'custom_dispatch_base_lat' => '33.8605000',
            'custom_dispatch_base_lng' => '130.4019000',
        ]);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->getJson("/api/therapists/{$profile->public_id}/availability?service_address_id={$serviceAddress->public_id}&therapist_menu_id={$menu->public_id}&date=2030-01-05")
            ->assertOk()
            ->assertJsonPath('data.walking_time_range', 'within_90_min')
            ->assertJsonPath('data.available_dates.0.bookable_window_count', 1)
            ->assertJsonPath('data.available_dates.0.is_bookable', true)
            ->assertJsonPath('data.windows.0.walking_time_range', 'within_90_min')
            ->assertJsonPath('data.windows.0.is_bookable', true);
    }

    public function test_public_availability_returns_only_days_with_bookable_windows_in_requested_range(): void
    {
        [$user, $serviceAddress, $profile, $menu] = $this->createAvailabilityFixture();

        TherapistAvailabilitySlot::create([
            'public_id' => 'slot_public_range_one',
            'therapist_profile_id' => $profile->id,
            'start_at' => CarbonImmutable::parse('2030-01-05 14:00:00'),
            'end_at' => CarbonImmutable::parse('2030-01-05 18:00:00'),
            'status' => TherapistAvailabilitySlot::STATUS_PUBLISHED,
            'dispatch_base_type' => TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_DEFAULT,
            'dispatch_area_label' => '天神周辺',
        ]);

        TherapistAvailabilitySlot::create([
            'public_id' => 'slot_public_range_two',
            'therapist_profile_id' => $profile->id,
            'start_at' => CarbonImmutable::parse('2030-01-07 19:00:00'),
            'end_at' => CarbonImmutable::parse('2030-01-07 22:00:00'),
            'status' => TherapistAvailabilitySlot::STATUS_PUBLISHED,
            'dispatch_base_type' => TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_DEFAULT,
            'dispatch_area_label' => '博多駅周辺',
        ]);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->getJson("/api/therapists/{$profile->public_id}/availability?service_address_id={$serviceAddress->public_id}&therapist_menu_id={$menu->public_id}&date=2030-01-05&available_dates_from=2030-01-05")
            ->assertOk()
            ->assertJsonCount(2, 'data.available_dates')
            ->assertJsonPath('data.available_dates.0.date', '2030-01-05')
            ->assertJsonPath('data.available_dates.0.earliest_start_at', CarbonImmutable::parse('2030-01-05 14:00:00')->toJSON())
            ->assertJsonPath('data.available_dates.0.latest_end_at', CarbonImmutable::parse('2030-01-05 18:00:00')->toJSON())
            ->assertJsonPath('data.available_dates.0.is_bookable', true)
            ->assertJsonPath('data.available_dates.1.date', '2030-01-07')
            ->assertJsonPath('data.available_dates.1.earliest_start_at', CarbonImmutable::parse('2030-01-07 19:00:00')->toJSON())
            ->assertJsonPath('data.available_dates.1.latest_end_at', CarbonImmutable::parse('2030-01-07 22:00:00')->toJSON())
            ->assertJsonPath('data.available_dates.1.is_bookable', true);
    }

    public function test_public_availability_returns_calendar_dates_for_requested_week(): void
    {
        [$user, $serviceAddress, $profile, $menu] = $this->createAvailabilityFixture();

        TherapistAvailabilitySlot::create([
            'public_id' => 'slot_public_week_one',
            'therapist_profile_id' => $profile->id,
            'start_at' => CarbonImmutable::parse('2030-01-05 14:00:00'),
            'end_at' => CarbonImmutable::parse('2030-01-05 18:00:00'),
            'status' => TherapistAvailabilitySlot::STATUS_PUBLISHED,
            'dispatch_base_type' => TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_DEFAULT,
            'dispatch_area_label' => '天神周辺',
        ]);

        TherapistAvailabilitySlot::create([
            'public_id' => 'slot_public_week_two',
            'therapist_profile_id' => $profile->id,
            'start_at' => CarbonImmutable::parse('2030-01-07 19:00:00'),
            'end_at' => CarbonImmutable::parse('2030-01-07 22:00:00'),
            'status' => TherapistAvailabilitySlot::STATUS_PUBLISHED,
            'dispatch_base_type' => TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_DEFAULT,
            'dispatch_area_label' => '博多駅周辺',
        ]);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->getJson("/api/therapists/{$profile->public_id}/availability?service_address_id={$serviceAddress->public_id}&therapist_menu_id={$menu->public_id}&date=2030-01-05&available_dates_from=2030-01-05&calendar_days=7")
            ->assertOk()
            ->assertJsonCount(7, 'data.calendar_dates')
            ->assertJsonPath('data.calendar_dates.0.date', '2030-01-05')
            ->assertJsonPath('data.calendar_dates.0.window_count', 1)
            ->assertJsonPath('data.calendar_dates.0.bookable_window_count', 1)
            ->assertJsonPath('data.calendar_dates.0.windows.0.dispatch_area_label', '天神周辺')
            ->assertJsonPath('data.calendar_dates.1.date', '2030-01-06')
            ->assertJsonPath('data.calendar_dates.1.window_count', 0)
            ->assertJsonPath('data.calendar_dates.1.windows', [])
            ->assertJsonPath('data.calendar_dates.2.date', '2030-01-07')
            ->assertJsonPath('data.calendar_dates.2.window_count', 1)
            ->assertJsonPath('data.calendar_dates.2.windows.0.dispatch_area_label', '博多駅周辺');
    }

    public function test_public_availability_shows_outside_area_slots_as_unbookable(): void
    {
        [$user, $serviceAddress, $profile, $menu] = $this->createAvailabilityFixture();

        TherapistAvailabilitySlot::create([
            'public_id' => 'slot_public_far_only',
            'therapist_profile_id' => $profile->id,
            'start_at' => CarbonImmutable::parse('2030-01-06 20:00:00'),
            'end_at' => CarbonImmutable::parse('2030-01-06 22:00:00'),
            'status' => TherapistAvailabilitySlot::STATUS_PUBLISHED,
            'dispatch_base_type' => TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_CUSTOM,
            'dispatch_area_label' => '遠方エリア',
            'custom_dispatch_base_label' => 'Outside',
            'custom_dispatch_base_lat' => '34.5000000',
            'custom_dispatch_base_lng' => '135.5000000',
        ]);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->getJson("/api/therapists/{$profile->public_id}/availability?service_address_id={$serviceAddress->public_id}&therapist_menu_id={$menu->public_id}&date=2030-01-06&available_dates_from=2030-01-06")
            ->assertOk()
            ->assertJsonPath('data.walking_time_range', null)
            ->assertJsonPath('data.estimated_total_amount_range', null)
            ->assertJsonCount(1, 'data.available_dates')
            ->assertJsonPath('data.available_dates.0.date', '2030-01-06')
            ->assertJsonPath('data.available_dates.0.window_count', 1)
            ->assertJsonPath('data.available_dates.0.bookable_window_count', 0)
            ->assertJsonPath('data.available_dates.0.is_bookable', false)
            ->assertJsonPath('data.available_dates.0.unavailable_reason', 'outside_service_area')
            ->assertJsonCount(1, 'data.windows')
            ->assertJsonPath('data.windows.0.availability_slot_id', 'slot_public_far_only')
            ->assertJsonPath('data.windows.0.is_bookable', false)
            ->assertJsonPath('data.windows.0.unavailable_reason', 'outside_service_area');
    }

    public function test_public_availability_includes_pending_scheduled_request_summary_for_same_therapist(): void
    {
        [$user, $serviceAddress, $profile, $menu] = $this->createAvailabilityFixture();

        TherapistAvailabilitySlot::create([
            'public_id' => 'slot_public_pending_same',
            'therapist_profile_id' => $profile->id,
            'start_at' => CarbonImmutable::parse('2030-01-06 20:00:00'),
            'end_at' => CarbonImmutable::parse('2030-01-06 22:00:00'),
            'status' => TherapistAvailabilitySlot::STATUS_PUBLISHED,
            'dispatch_base_type' => TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_DEFAULT,
            'dispatch_area_label' => '天神周辺',
        ]);

        $pendingBooking = Booking::create([
            'public_id' => 'book_public_pending_same',
            'user_account_id' => $user->id,
            'therapist_account_id' => $profile->account_id,
            'therapist_profile_id' => $profile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $serviceAddress->id,
            'status' => Booking::STATUS_REQUESTED,
            'is_on_demand' => false,
            'requested_start_at' => CarbonImmutable::parse('2030-01-06 20:00:00'),
            'scheduled_start_at' => CarbonImmutable::parse('2030-01-06 20:00:00'),
            'scheduled_end_at' => CarbonImmutable::parse('2030-01-06 21:00:00'),
            'duration_minutes' => 60,
            'request_expires_at' => CarbonImmutable::parse('2030-01-06 18:00:00'),
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->getJson("/api/therapists/{$profile->public_id}/availability?service_address_id={$serviceAddress->public_id}&therapist_menu_id={$menu->public_id}&date=2030-01-06")
            ->assertOk()
            ->assertJsonPath('data.pending_scheduled_request.public_id', $pendingBooking->public_id)
            ->assertJsonPath('data.pending_scheduled_request.status', Booking::STATUS_REQUESTED)
            ->assertJsonPath('data.pending_scheduled_request.scheduled_start_at', $pendingBooking->scheduled_start_at?->toIso8601String())
            ->assertJsonPath('data.pending_scheduled_request.request_expires_at', $pendingBooking->request_expires_at?->toIso8601String());
    }

    private function createAvailabilityFixture(): array
    {
        $user = Account::factory()->create(['public_id' => 'acc_public_availability_user_'.fake()->unique()->numerify('###')]);
        $therapist = Account::factory()->create(['public_id' => 'acc_public_availability_therapist_'.fake()->unique()->numerify('###')]);

        $serviceAddress = ServiceAddress::create([
            'public_id' => 'addr_public_availability_'.fake()->unique()->numerify('###'),
            'account_id' => $user->id,
            'place_type' => 'hotel',
            'prefecture' => '福岡県',
            'city' => '福岡市中央区',
            'address_line_encrypted' => Crypt::encryptString('Fukuoka Hotel'),
            'lat' => '33.5905000',
            'lng' => '130.4019000',
            'is_default' => true,
        ]);

        IdentityVerification::create([
            'account_id' => $therapist->id,
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);

        $profile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_public_availability_'.fake()->unique()->numerify('###'),
            'public_name' => 'Scheduled Therapist',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'photo_review_status' => 'approved',
            'is_online' => false,
        ]);

        $menu = TherapistMenu::create([
            'public_id' => 'menu_public_availability_'.fake()->unique()->numerify('###'),
            'therapist_profile_id' => $profile->id,
            'name' => 'Body Care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
            'is_active' => true,
        ]);

        TherapistBookingSetting::create([
            'therapist_profile_id' => $profile->id,
            'booking_request_lead_time_minutes' => 60,
            'travel_mode' => 'walking',
            'max_travel_minutes' => 120,
            'scheduled_base_label' => 'Tenjin Base',
            'scheduled_base_lat' => '33.5907000',
            'scheduled_base_lng' => '130.4020000',
        ]);

        return [$user, $serviceAddress, $profile, $menu];
    }
}
