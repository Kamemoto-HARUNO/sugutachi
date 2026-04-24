<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Booking;
use App\Models\ServiceAddress;
use App\Models\TherapistAvailabilitySlot;
use App\Models\TherapistBookingSetting;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use App\Models\TherapistTravelRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ScheduledBookingSchemaTest extends TestCase
{
    use RefreshDatabase;

    public function test_scheduled_booking_support_schema_exists(): void
    {
        $this->assertTrue(Schema::hasTable('therapist_booking_settings'));
        $this->assertTrue(Schema::hasTable('therapist_availability_slots'));
        $this->assertTrue(Schema::hasTable('therapist_travel_requests'));

        $this->assertTrue(Schema::hasColumns('therapist_profiles', [
            'therapist_cancellation_count',
        ]));

        $this->assertTrue(Schema::hasColumns('bookings', [
            'availability_slot_id',
            'buffer_before_minutes',
            'buffer_after_minutes',
            'cancel_reason_note_encrypted',
        ]));
    }

    public function test_new_models_can_persist_and_relate(): void
    {
        $user = Account::factory()->create(['public_id' => 'acc_scheduled_user']);
        $therapist = Account::factory()->create([
            'public_id' => 'acc_scheduled_therapist',
            'last_active_role' => 'therapist',
        ]);

        $profile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_scheduled_base',
            'public_name' => 'Scheduled Therapist',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'photo_review_status' => 'approved',
            'therapist_cancellation_count' => 2,
        ]);

        $setting = TherapistBookingSetting::create([
            'therapist_profile_id' => $profile->id,
            'booking_request_lead_time_minutes' => 90,
            'scheduled_base_label' => 'Tenjin Base',
            'scheduled_base_lat' => '33.5902000',
            'scheduled_base_lng' => '130.4017000',
            'scheduled_base_geohash' => 'xn76ur',
            'scheduled_base_accuracy_m' => 50,
        ]);

        $slot = TherapistAvailabilitySlot::create([
            'public_id' => 'slot_scheduled_base',
            'therapist_profile_id' => $profile->id,
            'start_at' => now()->addDay()->setTime(14, 0),
            'end_at' => now()->addDay()->setTime(18, 0),
            'status' => TherapistAvailabilitySlot::STATUS_PUBLISHED,
            'dispatch_base_type' => TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_CUSTOM,
            'dispatch_area_label' => '天神周辺',
            'custom_dispatch_base_label' => 'Tenjin Workday',
            'custom_dispatch_base_lat' => '33.5898000',
            'custom_dispatch_base_lng' => '130.3997000',
            'custom_dispatch_base_geohash' => 'xn76uq',
            'custom_dispatch_base_accuracy_m' => 80,
        ]);

        $menu = TherapistMenu::create([
            'public_id' => 'menu_scheduled_base',
            'therapist_profile_id' => $profile->id,
            'name' => 'Body Care 90',
            'duration_minutes' => 90,
            'base_price_amount' => 15000,
            'is_active' => true,
        ]);

        $address = ServiceAddress::create([
            'public_id' => 'addr_scheduled_base',
            'account_id' => $user->id,
            'label' => 'Hotel',
            'place_type' => 'hotel',
            'prefecture' => '福岡県',
            'city' => '福岡市中央区',
            'address_line_encrypted' => Crypt::encryptString('secret address'),
            'lat' => '33.5905000',
            'lng' => '130.4019000',
            'is_default' => true,
        ]);

        $booking = Booking::create([
            'public_id' => 'book_scheduled_base',
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $profile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $address->id,
            'availability_slot_id' => $slot->id,
            'status' => Booking::STATUS_REQUESTED,
            'is_on_demand' => false,
            'requested_start_at' => now()->addDay()->setTime(14, 30),
            'scheduled_start_at' => now()->addDay()->setTime(14, 30),
            'scheduled_end_at' => now()->addDay()->setTime(16, 0),
            'duration_minutes' => 90,
            'buffer_before_minutes' => 30,
            'buffer_after_minutes' => 45,
            'request_expires_at' => now()->addHours(6),
            'total_amount' => 15300,
            'therapist_net_amount' => 13500,
            'platform_fee_amount' => 1500,
            'matching_fee_amount' => 300,
        ]);

        $travelRequest = TherapistTravelRequest::create([
            'public_id' => 'travel_req_base',
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $profile->id,
            'prefecture' => '熊本県',
            'message_encrypted' => Crypt::encryptString('来月熊本に来る予定があればお願いしたいです。'),
            'status' => TherapistTravelRequest::STATUS_UNREAD,
        ]);

        $this->assertTrue($profile->bookingSetting->is($setting));
        $this->assertTrue($profile->availabilitySlots()->first()->is($slot));
        $this->assertTrue($booking->availabilitySlot->is($slot));
        $this->assertTrue($profile->travelRequests()->first()->is($travelRequest));
        $this->assertTrue($therapist->receivedTravelRequests()->first()->is($travelRequest));

        $this->assertDatabaseHas('therapist_booking_settings', [
            'therapist_profile_id' => $profile->id,
            'booking_request_lead_time_minutes' => 90,
        ]);
        $this->assertDatabaseHas('therapist_availability_slots', [
            'public_id' => 'slot_scheduled_base',
            'dispatch_area_label' => '天神周辺',
            'dispatch_base_type' => TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_CUSTOM,
        ]);
        $this->assertDatabaseHas('bookings', [
            'public_id' => 'book_scheduled_base',
            'availability_slot_id' => $slot->id,
            'buffer_before_minutes' => 30,
            'buffer_after_minutes' => 45,
        ]);
        $this->assertDatabaseHas('therapist_travel_requests', [
            'public_id' => 'travel_req_base',
            'prefecture' => '熊本県',
            'status' => TherapistTravelRequest::STATUS_UNREAD,
        ]);
    }
}
