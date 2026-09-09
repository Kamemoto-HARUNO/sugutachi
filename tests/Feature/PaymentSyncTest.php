<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Booking;
use App\Models\PaymentIntent;
use App\Models\ServiceAddress;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Stripe\ApiRequestor;
use Stripe\HttpClient\ClientInterface;
use Stripe\HttpClient\CurlClient;
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

    public function test_sync_does_not_apply_old_result_to_replacement_payment(): void
    {
        [$user, , $booking, $payment] = $this->createAuthorizingFixture();
        $replacement = null;
        $this->stubStripeStatus(function () use ($payment, &$replacement): void {
            $payment->update(['is_current' => false]);
            $replacement = $payment->replicate();
            $replacement->forceFill(['stripe_payment_intent_id' => 'pi_replacement', 'is_current' => true])->save();
        });
        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/payment-sync")->assertOk()
            ->assertJsonPath('data.booking.status', 'payment_authorizing')
            ->assertJsonPath('data.payment_intent.status', 'requires_payment_method');
        $this->assertNull($replacement->fresh()->authorized_at);
        $this->assertSame(0, $booking->statusLogs()->count());
    }

    public function test_sync_does_not_overwrite_cancellation_completed_while_stripe_was_responding(): void
    {
        [$user, , $booking, $payment] = $this->createAuthorizingFixture();
        $this->stubStripeStatus(function () use ($booking, $payment): void {
            $booking->update(['status' => 'payment_canceled']);
            $payment->update(['status' => 'canceled', 'canceled_at' => now()]);
        });
        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/payment-sync")->assertOk()
            ->assertJsonPath('data.booking.status', 'payment_canceled')
            ->assertJsonPath('data.payment_intent.status', 'canceled');
        $this->assertNull($payment->fresh()->authorized_at);
    }

    public function test_stripe_sync_returns_fresh_requested_state_and_only_transitions_once(): void
    {
        [$user, , $booking, $payment] = $this->createAuthorizingFixture();
        $this->stubStripeStatus(fn () => null);
        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/payment-sync")->assertOk()
            ->assertJsonPath('data.booking.status', 'requested');
        $this->postJson("/api/bookings/{$booking->public_id}/payment-sync")->assertOk();
        $this->assertSame(1, $booking->statusLogs()->where('to_status', 'requested')->count());
        $this->assertNotNull($payment->fresh()->authorized_at);
    }

    private function createAuthorizingFixture(): array
    {
        $fixture = $this->createPaymentSyncFixture();
        $fixture[2]->update(['status' => 'payment_authorizing', 'is_on_demand' => true]);
        $fixture[3]->update(['status' => 'requires_payment_method', 'authorized_at' => null]);

        return $fixture;
    }

    private function stubStripeStatus(\Closure $duringRetrieval): void
    {
        config(['services.stripe.secret' => 'sk_test_local_stub', 'services.stripe.local_simulation' => false]);
        $client = $this->createMock(ClientInterface::class);
        $client->expects($this->once())->method('request')->willReturnCallback(function ($method, $url) use ($duringRetrieval): array {
            $this->assertSame('get', $method);
            $this->assertStringEndsWith('/v1/payment_intents/pi_sync', $url);
            $duringRetrieval();

            return [json_encode(['id' => 'pi_sync', 'object' => 'payment_intent', 'status' => 'requires_capture']), 200, []];
        });
        ApiRequestor::setHttpClient($client);
    }

    protected function tearDown(): void
    {
        ApiRequestor::setHttpClient(CurlClient::instance());
        parent::tearDown();
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
