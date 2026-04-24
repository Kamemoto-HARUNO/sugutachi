<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Booking;
use App\Models\BookingMessage;
use App\Models\PaymentIntent;
use App\Models\Refund;
use App\Models\Report;
use App\Models\ServiceAddress;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Tests\TestCase;

class BookingListApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_filter_booking_list_with_context_fields(): void
    {
        [$user, $therapist, $scheduledBooking] = $this->createBookingListFixture();

        $this->withToken($user->createToken('api')->plainTextToken)
            ->getJson('/api/bookings?role=user&status=requested&request_type=scheduled&sort=scheduled_start_at&direction=asc')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $scheduledBooking->public_id)
            ->assertJsonPath('data.0.request_type', 'scheduled')
            ->assertJsonPath('data.0.counterparty.role', 'therapist')
            ->assertJsonPath('data.0.counterparty.public_id', $therapist->public_id)
            ->assertJsonPath('data.0.therapist_profile.public_id', 'thp_booking_list')
            ->assertJsonPath('data.0.therapist_menu.public_id', 'menu_booking_list_90')
            ->assertJsonPath('data.0.service_address.public_id', 'addr_booking_list')
            ->assertJsonPath('data.0.unread_message_count', 1)
            ->assertJsonPath('data.0.refund_count', 1)
            ->assertJsonPath('data.0.open_report_count', 1)
            ->assertJsonPath('data.0.current_payment_intent.status', PaymentIntent::STRIPE_STATUS_REQUIRES_CAPTURE)
            ->assertJsonPath('data.0.latest_message_sent_at', fn ($value) => filled($value));
    }

    public function test_therapist_can_list_own_bookings_with_user_counterparty(): void
    {
        [$user, $therapist, $scheduledBooking, $onDemandBooking] = $this->createBookingListFixture();

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->getJson('/api/bookings?role=therapist&request_type=on_demand&sort=created_at&direction=desc')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $onDemandBooking->public_id)
            ->assertJsonPath('data.0.request_type', 'on_demand')
            ->assertJsonPath('data.0.counterparty.role', 'user')
            ->assertJsonPath('data.0.counterparty.public_id', $user->public_id)
            ->assertJsonPath('data.0.unread_message_count', 1);

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->getJson("/api/bookings/{$scheduledBooking->public_id}")
            ->assertOk()
            ->assertJsonPath('data.counterparty.role', 'user')
            ->assertJsonPath('data.service_address.public_id', 'addr_booking_list')
            ->assertJsonPath('data.therapist_menu.public_id', 'menu_booking_list_90');
    }

    private function createBookingListFixture(): array
    {
        $user = Account::factory()->create([
            'public_id' => 'acc_booking_list_user',
            'display_name' => 'Booking List User',
        ]);
        $therapist = Account::factory()->create([
            'public_id' => 'acc_booking_list_therapist',
            'display_name' => 'Booking List Therapist',
        ]);

        $therapistProfile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_booking_list',
            'public_name' => 'List Therapist',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
        ]);
        $menu = TherapistMenu::create([
            'public_id' => 'menu_booking_list_90',
            'therapist_profile_id' => $therapistProfile->id,
            'name' => 'Body care 90',
            'duration_minutes' => 90,
            'base_price_amount' => 18000,
            'is_active' => true,
        ]);
        $address = ServiceAddress::create([
            'public_id' => 'addr_booking_list',
            'account_id' => $user->id,
            'label' => 'Hotel',
            'place_type' => 'hotel',
            'prefecture' => 'Tokyo',
            'city' => 'Shinjuku',
            'address_line_encrypted' => Crypt::encryptString('Secret address'),
            'lat' => '35.6895000',
            'lng' => '139.6917100',
            'is_default' => true,
        ]);

        $scheduledBooking = Booking::create([
            'public_id' => 'book_booking_list_scheduled',
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $address->id,
            'status' => Booking::STATUS_REQUESTED,
            'is_on_demand' => false,
            'requested_start_at' => now()->addDay()->setTime(20, 0),
            'scheduled_start_at' => now()->addDay()->setTime(20, 0),
            'scheduled_end_at' => now()->addDay()->setTime(21, 30),
            'duration_minutes' => 90,
            'request_expires_at' => now()->addHours(6),
            'total_amount' => 18300,
            'therapist_net_amount' => 16200,
            'platform_fee_amount' => 1800,
            'matching_fee_amount' => 300,
        ]);
        $onDemandBooking = Booking::create([
            'public_id' => 'book_booking_list_ondemand',
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $address->id,
            'status' => Booking::STATUS_ACCEPTED,
            'is_on_demand' => true,
            'requested_start_at' => now()->subMinutes(30),
            'duration_minutes' => 90,
            'accepted_at' => now()->subMinutes(20),
            'confirmed_at' => now()->subMinutes(20),
            'total_amount' => 18300,
            'therapist_net_amount' => 16200,
            'platform_fee_amount' => 1800,
            'matching_fee_amount' => 300,
        ]);

        $otherUser = Account::factory()->create();
        $otherTherapist = Account::factory()->create();
        $otherProfile = TherapistProfile::create([
            'account_id' => $otherTherapist->id,
            'public_id' => 'thp_booking_list_other',
            'public_name' => 'Other Therapist',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
        ]);
        $otherMenu = TherapistMenu::create([
            'public_id' => 'menu_booking_list_other',
            'therapist_profile_id' => $otherProfile->id,
            'name' => 'Other Menu',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
            'is_active' => true,
        ]);
        $otherAddress = ServiceAddress::create([
            'public_id' => 'addr_booking_list_other',
            'account_id' => $otherUser->id,
            'label' => 'Hotel',
            'place_type' => 'hotel',
            'prefecture' => 'Tokyo',
            'city' => 'Minato',
            'address_line_encrypted' => Crypt::encryptString('Other secret address'),
            'lat' => '35.6580340',
            'lng' => '139.7016360',
        ]);

        Booking::create([
            'public_id' => 'book_booking_list_other',
            'user_account_id' => $otherUser->id,
            'therapist_account_id' => $otherTherapist->id,
            'therapist_profile_id' => $otherProfile->id,
            'therapist_menu_id' => $otherMenu->id,
            'service_address_id' => $otherAddress->id,
            'status' => Booking::STATUS_REQUESTED,
            'duration_minutes' => 60,
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);

        PaymentIntent::create([
            'booking_id' => $scheduledBooking->id,
            'payer_account_id' => $user->id,
            'stripe_payment_intent_id' => 'pi_booking_list_scheduled',
            'status' => PaymentIntent::STRIPE_STATUS_REQUIRES_CAPTURE,
            'capture_method' => 'manual',
            'currency' => 'jpy',
            'amount' => 18300,
            'application_fee_amount' => 2100,
            'transfer_amount' => 16200,
            'is_current' => true,
        ]);

        BookingMessage::create([
            'booking_id' => $scheduledBooking->id,
            'sender_account_id' => $therapist->id,
            'message_type' => 'text',
            'body_encrypted' => Crypt::encryptString('到着予定の少し前に連絡します。'),
            'sent_at' => now()->subMinutes(5),
        ]);
        BookingMessage::create([
            'booking_id' => $onDemandBooking->id,
            'sender_account_id' => $user->id,
            'message_type' => 'text',
            'body_encrypted' => Crypt::encryptString('よろしくお願いします。'),
            'sent_at' => now()->subMinutes(4),
        ]);

        Report::create([
            'public_id' => 'rep_booking_list',
            'booking_id' => $scheduledBooking->id,
            'reporter_account_id' => $user->id,
            'target_account_id' => $therapist->id,
            'category' => 'boundary_violation',
            'severity' => Report::SEVERITY_MEDIUM,
            'status' => Report::STATUS_OPEN,
        ]);

        $scheduledBooking->refunds()->create([
            'public_id' => 'ref_booking_list',
            'requested_by_account_id' => $user->id,
            'status' => Refund::STATUS_REQUESTED,
            'reason_code' => 'schedule_change',
            'requested_amount' => 4000,
        ]);

        return [$user, $therapist, $scheduledBooking, $onDemandBooking];
    }
}
