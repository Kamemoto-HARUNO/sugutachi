<?php

namespace Tests\Feature;

use App\Contracts\Payments\CreatedPaymentIntent;
use App\Contracts\Payments\PaymentIntentGateway;
use App\Models\Account;
use App\Models\Booking;
use App\Models\BookingQuote;
use App\Models\IdentityVerification;
use App\Models\PaymentIntent;
use App\Models\ServiceAddress;
use App\Models\StripeConnectedAccount;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
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

            public function capture(PaymentIntent $paymentIntent): string
            {
                return PaymentIntent::STRIPE_STATUS_SUCCEEDED;
            }

            public function cancel(PaymentIntent $paymentIntent): string
            {
                return PaymentIntent::STRIPE_STATUS_CANCELED;
            }
        });

        [, , $userToken, $therapistProfileId, $therapistMenuId, $serviceAddressId] = $this->createBookableFixture();

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
            ->assertJsonPath('data.status', Booking::STATUS_PAYMENT_AUTHORIZING)
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
            'status' => Booking::STATUS_PAYMENT_AUTHORIZING,
            'total_amount' => 12300,
        ]);

        $this->assertDatabaseHas('payment_intents', [
            'stripe_payment_intent_id' => 'pi_test_'.$bookingId,
            'amount' => 12300,
            'is_current' => true,
        ]);
    }

    public function test_quote_and_booking_require_therapist_to_remain_discoverable(): void
    {
        [$user, $therapist, $userToken, $therapistProfileId, $therapistMenuId, $serviceAddressId] = $this->createBookableFixture();

        $quoteId = $this->withToken($userToken)
            ->postJson('/api/booking-quotes', [
                'therapist_profile_id' => $therapistProfileId,
                'therapist_menu_id' => $therapistMenuId,
                'service_address_id' => $serviceAddressId,
                'duration_minutes' => 60,
                'is_on_demand' => true,
            ])
            ->assertCreated()
            ->json('data.quote_id');

        $therapist->forceFill([
            'status' => Account::STATUS_SUSPENDED,
            'suspended_at' => now(),
            'suspension_reason' => 'policy_violation',
        ])->save();

        $this->withToken($userToken)
            ->postJson('/api/booking-quotes', [
                'therapist_profile_id' => $therapistProfileId,
                'therapist_menu_id' => $therapistMenuId,
                'service_address_id' => $serviceAddressId,
                'duration_minutes' => 60,
                'is_on_demand' => true,
            ])
            ->assertNotFound();

        $this->withToken($userToken)
            ->postJson('/api/bookings', [
                'quote_id' => $quoteId,
            ])
            ->assertNotFound();

        $this->assertDatabaseMissing('bookings', [
            'current_quote_id' => BookingQuote::query()->where('public_id', $quoteId)->value('id'),
        ]);
    }

    private function createBookableFixture(): array
    {
        $user = Account::factory()->create(['public_id' => 'acc_user_flow']);
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_flow']);
        $userToken = $user->createToken('api')->plainTextToken;
        $therapist->roleAssignments()->create([
            'role' => 'therapist',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        IdentityVerification::create([
            'account_id' => $therapist->id,
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);

        $therapistProfile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_quote_flow',
            'public_name' => 'Test Therapist',
            'bio' => 'Relaxation focused body care.',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'photo_review_status' => 'approved',
            'is_online' => true,
            'online_since' => now()->subMinutes(5),
            'approved_at' => now(),
        ]);
        $therapistMenu = TherapistMenu::create([
            'public_id' => 'menu_quote_flow_60',
            'therapist_profile_id' => $therapistProfile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
            'is_active' => true,
        ]);
        $therapistProfile->location()->create([
            'lat' => 35.681236,
            'lng' => 139.767125,
            'accuracy_m' => 30,
            'source' => 'test',
            'is_searchable' => true,
        ]);

        $serviceAddressId = ServiceAddress::create([
            'public_id' => 'addr_quote_flow',
            'account_id' => $user->id,
            'label' => 'Hotel',
            'place_type' => 'hotel',
            'prefecture' => 'Tokyo',
            'city' => 'Chiyoda',
            'address_line_encrypted' => Crypt::encryptString('secret address'),
            'lat' => 35.682000,
            'lng' => 139.768000,
            'is_default' => true,
        ])->public_id;

        $this->assertTrue(
            TherapistProfile::query()
                ->discoverableTo($user)
                ->where('public_id', $therapistProfile->public_id)
                ->exists()
        );

        $discoverableProfile = TherapistProfile::query()
            ->discoverableTo($user)
            ->where('public_id', $therapistProfile->public_id)
            ->first();

        $this->assertNotNull($discoverableProfile);
        $this->assertTrue(
            TherapistMenu::query()
                ->where('public_id', $therapistMenu->public_id)
                ->where('therapist_profile_id', $discoverableProfile->id)
                ->where('is_active', true)
                ->exists()
        );
        $this->assertTrue(
            ServiceAddress::query()
                ->where('public_id', $serviceAddressId)
                ->where('account_id', $user->id)
                ->exists()
        );

        return [$user, $therapist, $userToken, $therapistProfile->public_id, $therapistMenu->public_id, $serviceAddressId];
    }
}
