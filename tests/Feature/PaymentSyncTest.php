<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Booking;
use App\Models\PaymentIntent;
use App\Models\ServiceAddress;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PaymentSyncTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_sync_booking_and_current_payment_intent_status(): void
    {
        [$user, , $booking, $paymentIntent] = $this->createPaymentSyncFixture();

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/payment-sync")
            ->assertOk()
            ->assertJsonPath('data.booking.public_id', $booking->public_id)
            ->assertJsonPath('data.booking.status', Booking::STATUS_REQUESTED)
            ->assertJsonPath('data.booking.current_payment_intent.status', PaymentIntent::STRIPE_STATUS_REQUIRES_CAPTURE)
            ->assertJsonPath('data.booking.refund_breakdown.refund_count', 0)
            ->assertJsonPath('data.payment_intent.stripe_payment_intent_id', $paymentIntent->stripe_payment_intent_id)
            ->assertJsonPath('data.payment_intent.status', PaymentIntent::STRIPE_STATUS_REQUIRES_CAPTURE)
            ->assertJsonPath('data.payment_intent.authorized_at', fn ($value) => filled($value))
            ->assertJsonPath('data.payment_intent.last_stripe_event_id', 'evt_authorized_sync');
    }

    public function test_non_owner_cannot_sync_booking_payment_status(): void
    {
        [, $therapist, $booking] = $this->createPaymentSyncFixture();

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/payment-sync")
            ->assertNotFound();
    }

    private function createPaymentSyncFixture(): array
    {
        $user = Account::factory()->create(['public_id' => 'acc_user_sync']);
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_sync']);

        $therapistProfile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_sync',
            'public_name' => 'Sync Therapist',
            'profile_status' => 'approved',
        ]);

        $menu = TherapistMenu::create([
            'public_id' => 'menu_sync_60',
            'therapist_profile_id' => $therapistProfile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
        ]);

        $address = ServiceAddress::create([
            'public_id' => 'addr_sync',
            'account_id' => $user->id,
            'place_type' => 'hotel',
            'address_line_encrypted' => 'encrypted-address',
            'lat' => '35.6812360',
            'lng' => '139.7671250',
        ]);

        $booking = Booking::create([
            'public_id' => 'book_sync',
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

        $paymentIntent = PaymentIntent::create([
            'booking_id' => $booking->id,
            'payer_account_id' => $user->id,
            'stripe_payment_intent_id' => 'pi_sync',
            'status' => PaymentIntent::STRIPE_STATUS_REQUIRES_CAPTURE,
            'capture_method' => 'manual',
            'currency' => 'jpy',
            'amount' => 12300,
            'application_fee_amount' => 1500,
            'transfer_amount' => 10800,
            'is_current' => true,
            'authorized_at' => now(),
            'last_stripe_event_id' => 'evt_authorized_sync',
        ]);

        return [$user, $therapist, $booking, $paymentIntent];
    }
}
