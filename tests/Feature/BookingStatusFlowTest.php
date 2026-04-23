<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Booking;
use App\Models\ServiceAddress;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BookingStatusFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_therapist_and_user_can_advance_booking_statuses(): void
    {
        [$user, $therapist, $booking] = $this->createRequestedBooking();

        $userToken = $user->createToken('api')->plainTextToken;
        $therapistToken = $therapist->createToken('api')->plainTextToken;

        $this->withToken($therapistToken)
            ->getJson('/api/me/therapist/booking-requests')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $booking->public_id);

        $this->withToken($therapistToken)
            ->postJson("/api/bookings/{$booking->public_id}/accept")
            ->assertOk()
            ->assertJsonPath('data.status', Booking::STATUS_ACCEPTED)
            ->assertJsonPath('data.accepted_at', fn ($value) => filled($value));

        $this->withToken($therapistToken)
            ->postJson("/api/bookings/{$booking->public_id}/start")
            ->assertConflict();

        $this->withToken($therapistToken)
            ->postJson("/api/bookings/{$booking->public_id}/moving")
            ->assertOk()
            ->assertJsonPath('data.status', Booking::STATUS_MOVING);

        $this->withToken($therapistToken)
            ->postJson("/api/bookings/{$booking->public_id}/arrived")
            ->assertOk()
            ->assertJsonPath('data.status', Booking::STATUS_ARRIVED);

        $this->withToken($therapistToken)
            ->postJson("/api/bookings/{$booking->public_id}/start")
            ->assertOk()
            ->assertJsonPath('data.status', Booking::STATUS_IN_PROGRESS);

        $this->withToken($therapistToken)
            ->postJson("/api/bookings/{$booking->public_id}/complete")
            ->assertOk()
            ->assertJsonPath('data.status', Booking::STATUS_THERAPIST_COMPLETED)
            ->assertJsonPath('data.ended_at', fn ($value) => filled($value));

        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => Booking::STATUS_THERAPIST_COMPLETED,
        ]);

        $this->assertDatabaseCount('booking_status_logs', 5);
    }

    public function test_user_cannot_accept_booking_as_therapist(): void
    {
        [$user, , $booking] = $this->createRequestedBooking();

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/accept")
            ->assertNotFound();
    }

    public function test_therapist_can_reject_requested_booking(): void
    {
        [, $therapist, $booking] = $this->createRequestedBooking();

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/reject")
            ->assertOk()
            ->assertJsonPath('data.status', Booking::STATUS_REJECTED)
            ->assertJsonPath('data.cancel_reason_code', 'therapist_rejected');

        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => Booking::STATUS_REJECTED,
            'cancel_reason_code' => 'therapist_rejected',
        ]);
    }

    public function test_user_can_confirm_therapist_completed_booking(): void
    {
        [$user, , $booking] = $this->createRequestedBooking();

        $booking->update([
            'status' => Booking::STATUS_THERAPIST_COMPLETED,
            'ended_at' => now(),
        ]);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/user-complete-confirmation")
            ->assertOk()
            ->assertJsonPath('data.status', Booking::STATUS_COMPLETED);

        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => Booking::STATUS_COMPLETED,
        ]);
    }

    private function createRequestedBooking(): array
    {
        $user = Account::factory()->create(['public_id' => 'acc_user_'.fake()->unique()->numberBetween(1000, 9999)]);
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_'.fake()->unique()->numberBetween(1000, 9999)]);

        $therapistProfile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_'.fake()->unique()->numberBetween(1000, 9999),
            'public_name' => 'Test Therapist',
            'profile_status' => 'approved',
        ]);

        $menu = TherapistMenu::create([
            'public_id' => 'menu_'.fake()->unique()->numberBetween(1000, 9999),
            'therapist_profile_id' => $therapistProfile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
        ]);

        $address = ServiceAddress::create([
            'public_id' => 'addr_'.fake()->unique()->numberBetween(1000, 9999),
            'account_id' => $user->id,
            'place_type' => 'hotel',
            'address_line_encrypted' => 'encrypted-address',
            'lat' => '35.6812360',
            'lng' => '139.7671250',
        ]);

        $booking = Booking::create([
            'public_id' => 'book_'.fake()->unique()->numberBetween(1000, 9999),
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $address->id,
            'status' => Booking::STATUS_REQUESTED,
            'duration_minutes' => 60,
            'request_expires_at' => now()->addMinutes(10),
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);

        return [$user, $therapist, $booking];
    }
}
