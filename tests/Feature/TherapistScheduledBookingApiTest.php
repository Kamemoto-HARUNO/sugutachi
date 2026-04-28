<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Booking;
use App\Models\ServiceAddress;
use App\Models\TherapistAvailabilitySlot;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Tests\TestCase;

class TherapistScheduledBookingApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_therapist_can_get_default_and_update_scheduled_booking_settings(): void
    {
        [$therapist, $token] = $this->createTherapist();

        $this->withToken($token)
            ->getJson('/api/me/therapist/scheduled-booking-settings')
            ->assertOk()
            ->assertJsonPath('data.booking_request_lead_time_minutes', 60)
            ->assertJsonPath('data.travel_mode', 'walking')
            ->assertJsonPath('data.max_travel_minutes', 120)
            ->assertJsonPath('data.has_scheduled_base_location', false)
            ->assertJsonPath('data.can_publish_scheduled_bookings', false)
            ->assertJsonPath('data.scheduled_base_location', null);

        $this->withToken($token)
            ->putJson('/api/me/therapist/scheduled-booking-settings', [
                'booking_request_lead_time_minutes' => 90,
                'travel_mode' => 'car',
                'max_travel_minutes' => 150,
                'scheduled_base_location' => [
                    'label' => 'Tenjin Base',
                    'lat' => 33.5902,
                    'lng' => 130.4017,
                    'accuracy_m' => 50,
                ],
            ])
            ->assertOk()
            ->assertJsonPath('data.booking_request_lead_time_minutes', 90)
            ->assertJsonPath('data.travel_mode', 'car')
            ->assertJsonPath('data.max_travel_minutes', 150)
            ->assertJsonPath('data.has_scheduled_base_location', true)
            ->assertJsonPath('data.can_publish_scheduled_bookings', true)
            ->assertJsonPath('data.scheduled_base_location.label', 'Tenjin Base');

        $this->assertDatabaseHas('therapist_booking_settings', [
            'therapist_profile_id' => $therapist->therapistProfile->id,
            'booking_request_lead_time_minutes' => 90,
            'travel_mode' => 'car',
            'max_travel_minutes' => 150,
            'scheduled_base_label' => 'Tenjin Base',
        ]);
    }

    public function test_therapist_can_manage_availability_slots_with_default_and_custom_dispatch_bases(): void
    {
        [$therapist, $token] = $this->createTherapist();

        $this->withToken($token)
            ->putJson('/api/me/therapist/scheduled-booking-settings', [
                'booking_request_lead_time_minutes' => 60,
                'travel_mode' => 'walking',
                'max_travel_minutes' => 120,
                'scheduled_base_location' => [
                    'label' => 'Central Base',
                    'lat' => 33.5902,
                    'lng' => 130.4017,
                    'accuracy_m' => 50,
                ],
            ])
            ->assertOk();

        $defaultSlotId = $this->withToken($token)
            ->postJson('/api/me/therapist/availability-slots', [
                'start_at' => '2030-01-02T14:00:00+09:00',
                'end_at' => '2030-01-02T18:00:00+09:00',
                'status' => 'published',
                'dispatch_base_type' => 'default',
                'dispatch_area_label' => '天神周辺',
            ])
            ->assertCreated()
            ->assertJsonPath('data.dispatch_base_type', 'default')
            ->assertJsonPath('data.custom_dispatch_base', null)
            ->json('data.public_id');

        $customSlotId = $this->withToken($token)
            ->postJson('/api/me/therapist/availability-slots', [
                'start_at' => '2030-01-03T11:00:00+09:00',
                'end_at' => '2030-01-03T16:00:00+09:00',
                'status' => 'hidden',
                'dispatch_base_type' => 'custom',
                'dispatch_area_label' => '博多駅周辺',
                'custom_dispatch_base' => [
                    'label' => 'Hakata Visit',
                    'lat' => 33.5898,
                    'lng' => 130.4207,
                    'accuracy_m' => 80,
                ],
            ])
            ->assertCreated()
            ->assertJsonPath('data.dispatch_base_type', 'custom')
            ->assertJsonPath('data.custom_dispatch_base.label', 'Hakata Visit')
            ->json('data.public_id');

        $this->withToken($token)
            ->getJson('/api/me/therapist/availability-slots?status=published')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $defaultSlotId);

        $this->withToken($token)
            ->patchJson("/api/me/therapist/availability-slots/{$customSlotId}", [
                'status' => 'published',
                'dispatch_area_label' => '博多周辺',
            ])
            ->assertOk()
            ->assertJsonPath('data.public_id', $customSlotId)
            ->assertJsonPath('data.status', 'published')
            ->assertJsonPath('data.dispatch_area_label', '博多周辺');

        $this->withToken($token)
            ->deleteJson("/api/me/therapist/availability-slots/{$customSlotId}")
            ->assertNoContent();

        $this->assertSoftDeleted('therapist_availability_slots', [
            'public_id' => $customSlotId,
        ]);
    }

    public function test_availability_slot_can_infer_dispatch_area_label_from_base_information(): void
    {
        [$therapist, $token] = $this->createTherapist();

        $this->withToken($token)
            ->putJson('/api/me/therapist/scheduled-booking-settings', [
                'booking_request_lead_time_minutes' => 60,
                'travel_mode' => 'walking',
                'max_travel_minutes' => 120,
                'scheduled_base_location' => [
                    'label' => '新宿ベース',
                    'lat' => 35.6895,
                    'lng' => 139.6917,
                    'accuracy_m' => 40,
                ],
            ])
            ->assertOk();

        $this->withToken($token)
            ->postJson('/api/me/therapist/availability-slots', [
                'start_at' => '2030-01-04T14:00:00+09:00',
                'end_at' => '2030-01-04T17:00:00+09:00',
                'status' => 'published',
                'dispatch_base_type' => 'default',
            ])
            ->assertCreated()
            ->assertJsonPath('data.dispatch_area_label', '新宿周辺');

        $this->withToken($token)
            ->postJson('/api/me/therapist/availability-slots', [
                'start_at' => '2030-01-05T14:00:00+09:00',
                'end_at' => '2030-01-05T17:00:00+09:00',
                'status' => 'hidden',
                'dispatch_base_type' => 'custom',
                'custom_dispatch_base' => [
                    'label' => '渋谷サテライト',
                    'lat' => 35.6580,
                    'lng' => 139.7016,
                    'accuracy_m' => 30,
                ],
            ])
            ->assertCreated()
            ->assertJsonPath('data.dispatch_area_label', '渋谷周辺');
    }

    public function test_availability_slot_validation_rejects_missing_default_base_non_quarter_hour_and_overlap(): void
    {
        [$therapist, $token] = $this->createTherapist();

        $this->withToken($token)
            ->postJson('/api/me/therapist/availability-slots', [
                'start_at' => '2030-01-02T14:00:00+09:00',
                'end_at' => '2030-01-02T18:00:00+09:00',
                'status' => 'published',
                'dispatch_base_type' => 'default',
                'dispatch_area_label' => '天神周辺',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['dispatch_base_type']);

        $this->withToken($token)
            ->putJson('/api/me/therapist/scheduled-booking-settings', [
                'booking_request_lead_time_minutes' => 60,
                'travel_mode' => 'walking',
                'max_travel_minutes' => 120,
                'scheduled_base_location' => [
                    'label' => 'Central Base',
                    'lat' => 33.5902,
                    'lng' => 130.4017,
                ],
            ])
            ->assertOk();

        $this->withToken($token)
            ->postJson('/api/me/therapist/availability-slots', [
                'start_at' => '2030-01-02T14:10:00+09:00',
                'end_at' => '2030-01-02T18:00:00+09:00',
                'status' => 'published',
                'dispatch_base_type' => 'default',
                'dispatch_area_label' => '天神周辺',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['start_at', 'end_at']);

        $this->withToken($token)
            ->postJson('/api/me/therapist/availability-slots', [
                'start_at' => '2030-01-02T14:00:00+09:00',
                'end_at' => '2030-01-02T14:30:00+09:00',
                'status' => 'published',
                'dispatch_base_type' => 'default',
                'dispatch_area_label' => '天神周辺',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['end_at']);

        $slotId = $this->withToken($token)
            ->postJson('/api/me/therapist/availability-slots', [
                'start_at' => '2030-01-02T14:00:00+09:00',
                'end_at' => '2030-01-02T18:00:00+09:00',
                'status' => 'published',
                'dispatch_base_type' => 'default',
                'dispatch_area_label' => '天神周辺',
            ])
            ->assertCreated()
            ->json('data.public_id');

        $this->withToken($token)
            ->postJson('/api/me/therapist/availability-slots', [
                'start_at' => '2030-01-02T17:00:00+09:00',
                'end_at' => '2030-01-02T19:00:00+09:00',
                'status' => 'published',
                'dispatch_base_type' => 'default',
                'dispatch_area_label' => '大名周辺',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['start_at']);

        $this->assertDatabaseHas('therapist_availability_slots', [
            'public_id' => $slotId,
        ]);
    }

    public function test_therapist_cannot_update_or_delete_slot_with_blocking_booking(): void
    {
        [$therapist, $token] = $this->createTherapist();

        $this->withToken($token)
            ->putJson('/api/me/therapist/scheduled-booking-settings', [
                'booking_request_lead_time_minutes' => 60,
                'travel_mode' => 'walking',
                'max_travel_minutes' => 120,
                'scheduled_base_location' => [
                    'label' => 'Central Base',
                    'lat' => 33.5902,
                    'lng' => 130.4017,
                ],
            ])
            ->assertOk();

        $slot = TherapistAvailabilitySlot::create([
            'public_id' => 'slot_locking_case',
            'therapist_profile_id' => $therapist->therapistProfile->id,
            'start_at' => '2030-01-02 14:00:00',
            'end_at' => '2030-01-02 18:00:00',
            'status' => TherapistAvailabilitySlot::STATUS_PUBLISHED,
            'dispatch_base_type' => TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_DEFAULT,
            'dispatch_area_label' => '天神周辺',
        ]);

        $user = Account::factory()->create(['public_id' => 'acc_slot_user']);
        $address = ServiceAddress::create([
            'public_id' => 'addr_slot_locking',
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
        $menu = TherapistMenu::create([
            'public_id' => 'menu_slot_locking',
            'therapist_profile_id' => $therapist->therapistProfile->id,
            'name' => 'Body Care 90',
            'duration_minutes' => 90,
            'base_price_amount' => 15000,
            'is_active' => true,
        ]);

        Booking::create([
            'public_id' => 'book_slot_locking',
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapist->therapistProfile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $address->id,
            'availability_slot_id' => $slot->id,
            'status' => Booking::STATUS_REQUESTED,
            'is_on_demand' => false,
            'requested_start_at' => '2030-01-02 14:30:00',
            'scheduled_start_at' => '2030-01-02 14:30:00',
            'scheduled_end_at' => '2030-01-02 16:00:00',
            'duration_minutes' => 90,
            'request_expires_at' => now()->addHour(),
            'total_amount' => 15300,
            'therapist_net_amount' => 13500,
            'platform_fee_amount' => 1500,
            'matching_fee_amount' => 300,
        ]);

        $this->withToken($token)
            ->patchJson("/api/me/therapist/availability-slots/{$slot->public_id}", [
                'dispatch_area_label' => '変更不可',
            ])
            ->assertStatus(409);

        $this->withToken($token)
            ->deleteJson("/api/me/therapist/availability-slots/{$slot->public_id}")
            ->assertStatus(409);
    }

    public function test_past_availability_slots_are_returned_as_expired(): void
    {
        [$therapist, $token] = $this->createTherapist();

        TherapistAvailabilitySlot::create([
            'public_id' => 'slot_past_published',
            'therapist_profile_id' => $therapist->therapistProfile->id,
            'start_at' => now()->subHours(4),
            'end_at' => now()->subHours(2),
            'status' => TherapistAvailabilitySlot::STATUS_PUBLISHED,
            'dispatch_base_type' => TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_DEFAULT,
            'dispatch_area_label' => '過去枠',
        ]);

        TherapistAvailabilitySlot::create([
            'public_id' => 'slot_future_published',
            'therapist_profile_id' => $therapist->therapistProfile->id,
            'start_at' => now()->addDay()->setTime(14, 0),
            'end_at' => now()->addDay()->setTime(16, 0),
            'status' => TherapistAvailabilitySlot::STATUS_PUBLISHED,
            'dispatch_base_type' => TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_DEFAULT,
            'dispatch_area_label' => '未来枠',
        ]);

        $this->withToken($token)
            ->getJson('/api/me/therapist/availability-slots')
            ->assertOk()
            ->assertJsonPath('data.0.public_id', 'slot_past_published')
            ->assertJsonPath('data.0.status', TherapistAvailabilitySlot::STATUS_EXPIRED)
            ->assertJsonPath('data.1.public_id', 'slot_future_published')
            ->assertJsonPath('data.1.status', TherapistAvailabilitySlot::STATUS_PUBLISHED);

        $this->withToken($token)
            ->getJson('/api/me/therapist/availability-slots?status=published')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', 'slot_future_published');

        $this->assertDatabaseHas('therapist_availability_slots', [
            'public_id' => 'slot_past_published',
            'status' => TherapistAvailabilitySlot::STATUS_EXPIRED,
        ]);
    }

    private function createTherapist(): array
    {
        $therapist = Account::factory()->create([
            'public_id' => 'acc_therapist_scheduled_'.fake()->unique()->numerify('###'),
            'last_active_role' => 'therapist',
        ]);

        $therapist->roleAssignments()->create([
            'role' => 'therapist',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_scheduled_'.fake()->unique()->numerify('###'),
            'public_name' => 'Scheduled Therapist',
            'bio' => 'Relaxation focused body care.',
            'profile_status' => TherapistProfile::STATUS_DRAFT,
            'training_status' => 'completed',
            'photo_review_status' => 'approved',
        ]);

        return [$therapist->fresh('therapistProfile'), $therapist->createToken('api')->plainTextToken];
    }
}
