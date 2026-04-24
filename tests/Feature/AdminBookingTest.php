<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Booking;
use App\Models\BookingQuote;
use App\Models\PaymentIntent;
use App\Models\Refund;
use App\Models\Report;
use App\Models\ServiceAddress;
use App\Models\StripeDispute;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;
use Tests\TestCase;

class AdminBookingTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_and_view_bookings(): void
    {
        [$admin, $user, $therapist, $therapistProfile, $booking] = $this->createBookingFixture();
        $token = $admin->createToken('api')->plainTextToken;

        Booking::create([
            'public_id' => 'book_admin_other',
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $booking->therapist_menu_id,
            'service_address_id' => $booking->service_address_id,
            'status' => Booking::STATUS_CANCELED,
            'duration_minutes' => 90,
            'total_amount' => 18000,
            'therapist_net_amount' => 15000,
            'platform_fee_amount' => 2400,
            'matching_fee_amount' => 600,
        ]);

        $this->withToken($token)
            ->getJson("/api/admin/bookings?status=requested&user_account_id={$user->public_id}&therapist_profile_id={$therapistProfile->public_id}&sort=created_at&direction=asc")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $booking->public_id)
            ->assertJsonPath('data.0.user_account.public_id', $user->public_id)
            ->assertJsonPath('data.0.therapist_profile.public_id', $therapistProfile->public_id)
            ->assertJsonPath('data.0.current_payment_intent_status', 'requires_capture')
            ->assertJsonPath('data.0.refund_count', 1)
            ->assertJsonPath('data.0.report_count', 1)
            ->assertJsonPath('data.0.open_dispute_count', 1);

        $this->withToken($token)
            ->getJson("/api/admin/bookings/{$booking->public_id}")
            ->assertOk()
            ->assertJsonPath('data.public_id', $booking->public_id)
            ->assertJsonPath('data.service_address.address_line', 'Tokyo Station Hotel 1201')
            ->assertJsonPath('data.current_payment_intent.status', 'requires_capture')
            ->assertJsonPath('data.current_quote.quote_id', 'quote_admin_booking')
            ->assertJsonPath('data.refunds.0.public_id', 'ref_admin_booking')
            ->assertJsonPath('data.reports.0.public_id', 'rep_admin_booking')
            ->assertJsonPath('data.status_logs.0.to_status', Booking::STATUS_REQUESTED);

        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'booking.view',
            'target_type' => Booking::class,
            'target_id' => $booking->id,
        ]);
    }

    public function test_admin_can_filter_completed_bookings_by_completed_on(): void
    {
        [$admin, , , , $booking] = $this->createBookingFixture();
        $booking->forceFill([
            'status' => Booking::STATUS_COMPLETED,
            'updated_at' => now()->subDay(),
        ])->save();

        $todayCompleted = Booking::query()->create([
            'public_id' => 'book_admin_completed_today',
            'user_account_id' => $booking->user_account_id,
            'therapist_account_id' => $booking->therapist_account_id,
            'therapist_profile_id' => $booking->therapist_profile_id,
            'therapist_menu_id' => $booking->therapist_menu_id,
            'service_address_id' => $booking->service_address_id,
            'status' => Booking::STATUS_COMPLETED,
            'duration_minutes' => 60,
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
            'updated_at' => now(),
        ]);

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->getJson('/api/admin/bookings?status=completed&completed_on='.today()->toDateString())
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $todayCompleted->public_id);
    }

    public function test_admin_can_filter_bookings_by_operational_flags(): void
    {
        [$admin, $user, $therapist, $therapistProfile, $booking] = $this->createBookingFixture();

        Booking::create([
            'public_id' => 'book_admin_booking_plain',
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $booking->therapist_menu_id,
            'service_address_id' => $booking->service_address_id,
            'status' => Booking::STATUS_REQUESTED,
            'is_on_demand' => false,
            'duration_minutes' => 60,
            'request_expires_at' => now()->addDays(5),
            'total_amount' => 10000,
            'therapist_net_amount' => 8500,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->getJson('/api/admin/bookings?is_on_demand=1&payment_intent_status=requires_capture&has_refund_request=1&has_open_report=1&has_open_dispute=1&request_expires_to='.today()->toDateString())
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $booking->public_id);
    }

    public function test_non_admin_cannot_access_booking_admin_api(): void
    {
        [, $user, , , $booking] = $this->createBookingFixture();

        $this->withToken($user->createToken('api')->plainTextToken)
            ->getJson("/api/admin/bookings/{$booking->public_id}")
            ->assertForbidden();
    }

    private function createBookingFixture(): array
    {
        $admin = Account::factory()->create(['public_id' => 'acc_admin_booking']);
        $admin->roleAssignments()->create([
            'role' => 'admin',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        $user = Account::factory()->create([
            'public_id' => 'acc_user_booking_admin',
            'display_name' => 'Booking User',
            'email' => 'user-booking@example.com',
        ]);
        $therapist = Account::factory()->create([
            'public_id' => 'acc_therapist_booking_admin',
            'display_name' => 'Booking Therapist',
            'email' => 'therapist-booking@example.com',
        ]);

        $therapistProfile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_booking_admin',
            'public_name' => 'Admin Therapist',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
        ]);
        $menu = TherapistMenu::create([
            'public_id' => 'menu_booking_admin_60',
            'therapist_profile_id' => $therapistProfile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
        ]);
        $serviceAddress = ServiceAddress::create([
            'public_id' => 'addr_booking_admin',
            'account_id' => $user->id,
            'label' => 'Hotel',
            'place_type' => 'hotel',
            'prefecture' => 'Tokyo',
            'city' => 'Chiyoda',
            'address_line_encrypted' => Crypt::encryptString('Tokyo Station Hotel 1201'),
            'building_encrypted' => Crypt::encryptString('12F'),
            'access_notes_encrypted' => Crypt::encryptString('Front desk call required.'),
            'lat' => '35.6812360',
            'lng' => '139.7671250',
            'is_default' => true,
        ]);

        $booking = Booking::create([
            'public_id' => 'book_admin_booking',
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $serviceAddress->id,
            'status' => Booking::STATUS_REQUESTED,
            'requested_start_at' => now()->addHour(),
            'scheduled_start_at' => now()->addHour(),
            'scheduled_end_at' => now()->addHours(2),
            'duration_minutes' => 60,
            'request_expires_at' => now()->addMinutes(10),
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
            'user_snapshot_json' => [
                'account_public_id' => $user->public_id,
            ],
            'therapist_snapshot_json' => [
                'account_public_id' => $therapist->public_id,
                'therapist_profile_public_id' => $therapistProfile->public_id,
                'menu_public_id' => $menu->public_id,
            ],
        ]);

        $quote = BookingQuote::create([
            'public_id' => 'quote_admin_booking',
            'booking_id' => $booking->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $menu->id,
            'duration_minutes' => 60,
            'base_amount' => 12000,
            'travel_fee_amount' => 0,
            'night_fee_amount' => 0,
            'demand_fee_amount' => 0,
            'profile_adjustment_amount' => 0,
            'matching_fee_amount' => 300,
            'platform_fee_amount' => 1200,
            'total_amount' => 12300,
            'therapist_gross_amount' => 12000,
            'therapist_net_amount' => 10800,
            'calculation_version' => 'mvp-v1',
            'input_snapshot_json' => [
                'service_address_id' => $serviceAddress->public_id,
            ],
            'applied_rules_json' => [],
            'expires_at' => now()->addMinutes(10),
        ]);
        $booking->forceFill(['current_quote_id' => $quote->id])->save();

        PaymentIntent::create([
            'booking_id' => $booking->id,
            'payer_account_id' => $user->id,
            'stripe_payment_intent_id' => 'pi_admin_booking',
            'status' => 'requires_capture',
            'capture_method' => 'manual',
            'currency' => 'jpy',
            'amount' => 12300,
            'application_fee_amount' => 1500,
            'transfer_amount' => 10800,
            'is_current' => true,
        ]);

        Refund::create([
            'public_id' => 'ref_admin_booking',
            'booking_id' => $booking->id,
            'requested_by_account_id' => $user->id,
            'status' => Refund::STATUS_REQUESTED,
            'reason_code' => 'service_issue',
            'requested_amount' => 5000,
        ]);

        Report::create([
            'public_id' => 'rep_admin_booking',
            'booking_id' => $booking->id,
            'reporter_account_id' => $user->id,
            'target_account_id' => $therapist->id,
            'category' => 'boundary_violation',
            'severity' => Report::SEVERITY_HIGH,
            'status' => Report::STATUS_OPEN,
        ]);
        StripeDispute::create([
            'booking_id' => $booking->id,
            'payment_intent_id' => PaymentIntent::query()->where('booking_id', $booking->id)->value('id'),
            'stripe_dispute_id' => 'dp_admin_booking',
            'status' => StripeDispute::STATUS_NEEDS_RESPONSE,
            'reason' => 'fraudulent',
            'amount' => 12300,
            'currency' => 'jpy',
            'evidence_due_by' => now()->addDays(7),
            'last_stripe_event_id' => 'evt_admin_booking',
        ]);

        $booking->statusLogs()->create([
            'to_status' => Booking::STATUS_REQUESTED,
            'actor_account_id' => $user->id,
            'actor_role' => 'user',
            'reason_code' => 'booking_created',
            'metadata_json' => ['ticket' => Str::uuid()->toString()],
            'created_at' => now(),
        ]);

        return [$admin, $user, $therapist, $therapistProfile, $booking->fresh()];
    }
}
