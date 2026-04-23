<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Booking;
use App\Models\ServiceAddress;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BookingCancellationTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_preview_and_cancel_before_acceptance_for_free(): void
    {
        [$user, , $booking] = $this->createBookingFixture(Booking::STATUS_REQUESTED);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/cancel-preview")
            ->assertOk()
            ->assertJsonPath('data.cancel_fee_amount', 0)
            ->assertJsonPath('data.refund_amount', 12300)
            ->assertJsonPath('data.policy_code', 'before_acceptance_free')
            ->assertJsonPath('data.payment_action', 'void_authorization');

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/cancel", [
                'reason_code' => 'user_schedule_changed',
            ])
            ->assertOk()
            ->assertJsonPath('data.booking.status', Booking::STATUS_CANCELED)
            ->assertJsonPath('data.booking.cancel_reason_code', 'user_schedule_changed')
            ->assertJsonPath('data.cancellation.cancel_fee_amount', 0);

        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => Booking::STATUS_CANCELED,
            'cancel_reason_code' => 'user_schedule_changed',
        ]);
        $this->assertDatabaseHas('booking_status_logs', [
            'booking_id' => $booking->id,
            'from_status' => Booking::STATUS_REQUESTED,
            'to_status' => Booking::STATUS_CANCELED,
            'actor_role' => 'user',
            'reason_code' => 'user_schedule_changed',
        ]);
    }

    public function test_user_cancel_within_24_hours_calculates_half_service_fee_plus_matching_fee(): void
    {
        [$user, , $booking] = $this->createBookingFixture(
            status: Booking::STATUS_ACCEPTED,
            scheduledStartAt: now()->addHours(4),
        );

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/cancel-preview")
            ->assertOk()
            ->assertJsonPath('data.cancel_fee_amount', 6300)
            ->assertJsonPath('data.refund_amount', 6000)
            ->assertJsonPath('data.policy_code', 'within_24_hours_half')
            ->assertJsonPath('data.payment_action', 'capture_cancel_fee_and_refund_remaining');
    }

    public function test_therapist_cancel_after_acceptance_is_full_refund(): void
    {
        [, $therapist, $booking] = $this->createBookingFixture(
            status: Booking::STATUS_ACCEPTED,
            scheduledStartAt: now()->addHours(2),
        );

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/cancel-preview")
            ->assertOk()
            ->assertJsonPath('data.cancel_fee_amount', 0)
            ->assertJsonPath('data.refund_amount', 12300)
            ->assertJsonPath('data.policy_code', 'therapist_cancel_full_refund');
    }

    public function test_completed_booking_cannot_be_canceled(): void
    {
        [$user, , $booking] = $this->createBookingFixture(Booking::STATUS_COMPLETED);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/cancel-preview")
            ->assertConflict();
    }

    private function createBookingFixture(string $status, mixed $scheduledStartAt = null): array
    {
        $user = Account::factory()->create(['public_id' => 'acc_user_cancel']);
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_cancel']);

        $therapistProfile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_cancel',
            'public_name' => 'Cancel Therapist',
            'profile_status' => 'approved',
        ]);

        $menu = TherapistMenu::create([
            'public_id' => 'menu_cancel_60',
            'therapist_profile_id' => $therapistProfile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
        ]);

        $address = ServiceAddress::create([
            'public_id' => 'addr_cancel',
            'account_id' => $user->id,
            'place_type' => 'hotel',
            'address_line_encrypted' => 'encrypted-address',
            'lat' => '35.6812360',
            'lng' => '139.7671250',
        ]);

        $booking = Booking::create([
            'public_id' => 'book_cancel',
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $address->id,
            'status' => $status,
            'duration_minutes' => 60,
            'scheduled_start_at' => $scheduledStartAt,
            'request_expires_at' => $status === Booking::STATUS_REQUESTED ? now()->addMinutes(10) : null,
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);

        return [$user, $therapist, $booking];
    }
}
