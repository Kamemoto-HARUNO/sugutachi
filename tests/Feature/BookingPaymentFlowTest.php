<?php

namespace Tests\Feature;

use App\Contracts\Payments\CreatedPaymentIntent;
use App\Contracts\Payments\PaymentIntentGateway;
use App\Models\Account;
use App\Models\Booking;
use App\Models\BookingQuote;
use App\Models\StripeConnectedAccount;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BookingPaymentFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_create_quote_booking_and_payment_intent(): void
    {
        $this->app->bind(PaymentIntentGateway::class, fn () => new class implements PaymentIntentGateway
        {
            public function create(
                Booking $booking,
                BookingQuote $quote,
                ?StripeConnectedAccount $connectedAccount = null
            ): CreatedPaymentIntent {
                return new CreatedPaymentIntent(
                    id: 'pi_test_'.$booking->public_id,
                    clientSecret: 'pi_test_secret_'.$booking->public_id,
                    status: 'requires_payment_method',
                );
            }
        });

        $user = Account::factory()->create(['public_id' => 'acc_user_flow']);
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_flow']);
        $userToken = $user->createToken('api')->plainTextToken;
        $therapistToken = $therapist->createToken('api')->plainTextToken;

        $therapistProfileId = $this->withToken($therapistToken)
            ->putJson('/api/me/therapist-profile', [
                'public_name' => 'Test Therapist',
                'bio' => 'Relaxation focused body care.',
                'training_status' => 'completed',
            ])
            ->assertOk()
            ->assertJsonPath('data.profile_status', 'approved')
            ->json('data.public_id');

        $this->withToken($therapistToken)
            ->putJson('/api/me/therapist/location', [
                'lat' => 35.681236,
                'lng' => 139.767125,
                'accuracy_m' => 30,
                'source' => 'test',
            ])
            ->assertOk()
            ->assertJsonPath('data.is_online', true);

        $therapistMenuId = $this->withToken($therapistToken)
            ->postJson('/api/me/therapist/menus', [
                'name' => 'Body care 60',
                'duration_minutes' => 60,
                'base_price_amount' => 12000,
            ])
            ->assertCreated()
            ->assertJsonPath('data.base_price_amount', 12000)
            ->json('data.public_id');

        $serviceAddressId = $this->withToken($userToken)
            ->postJson('/api/me/service-addresses', [
                'label' => 'Hotel',
                'place_type' => 'hotel',
                'prefecture' => 'Tokyo',
                'city' => 'Chiyoda',
                'address_line' => 'secret address',
                'lat' => 35.682000,
                'lng' => 139.768000,
                'is_default' => true,
            ])
            ->assertCreated()
            ->assertJsonPath('data.place_type', 'hotel')
            ->json('data.public_id');

        $quoteId = $this->withToken($userToken)
            ->postJson('/api/booking-quotes', [
                'therapist_profile_id' => $therapistProfileId,
                'therapist_menu_id' => $therapistMenuId,
                'service_address_id' => $serviceAddressId,
                'duration_minutes' => 60,
                'is_on_demand' => true,
            ])
            ->assertCreated()
            ->assertJsonPath('data.amounts.base_amount', 12000)
            ->assertJsonPath('data.amounts.matching_fee_amount', 300)
            ->assertJsonPath('data.amounts.platform_fee_amount', 1200)
            ->assertJsonPath('data.amounts.therapist_net_amount', 10800)
            ->assertJsonPath('data.amounts.total_amount', 12300)
            ->assertJsonPath('data.walking_time_range', 'within_15_min')
            ->json('data.quote_id');

        $bookingId = $this->withToken($userToken)
            ->postJson('/api/bookings', [
                'quote_id' => $quoteId,
            ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'requested')
            ->assertJsonPath('data.total_amount', 12300)
            ->json('data.public_id');

        $this->withToken($userToken)
            ->postJson("/api/bookings/{$bookingId}/payment-intents")
            ->assertCreated()
            ->assertJsonPath('data.stripe_payment_intent_id', 'pi_test_'.$bookingId)
            ->assertJsonPath('data.client_secret', 'pi_test_secret_'.$bookingId)
            ->assertJsonPath('data.amount', 12300)
            ->assertJsonPath('data.capture_method', 'manual');

        $this->assertDatabaseHas('bookings', [
            'public_id' => $bookingId,
            'status' => 'requested',
            'total_amount' => 12300,
        ]);

        $this->assertDatabaseHas('payment_intents', [
            'stripe_payment_intent_id' => 'pi_test_'.$bookingId,
            'amount' => 12300,
            'is_current' => true,
        ]);
    }
}
