<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Booking;
use App\Models\IdentityVerification;
use App\Models\PaymentIntent;
use App\Models\Refund;
use App\Models\RoleRelationship;
use App\Models\ServiceAddress;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use App\Services\Payments\LocalPaymentIntentGateway;
use App\Services\Payments\LocalPaymentSimulation;
use App\Services\Payments\LocalRefundGateway;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class LocalPaymentFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_simulated_request_acceptance_messages_completion_and_refund(): void
    {
        // Exercise the real gateways against an isolated test DB. Environment guard has separate tests.
        $this->partialMock(LocalPaymentSimulation::class, fn ($mock) => $mock->shouldReceive('enabled')->andReturn(true));
        [$user, $therapist, $token, $profile, $menu, $address] = $this->createBookableFixture();
        $quoteId = $this->withToken($token)->postJson('/api/booking-quotes', [
            'therapist_profile_id' => $profile, 'therapist_menu_id' => $menu,
            'service_address_id' => $address, 'duration_minutes' => 60, 'is_on_demand' => true,
        ])->assertCreated()->json('data.quote_id');
        $bookingId = $this->postJson('/api/bookings', ['quote_id' => $quoteId])->assertCreated()->json('data.public_id');
        $this->postJson("/api/bookings/{$bookingId}/payment-intents")->assertCreated()
            ->assertJsonPath('data.status', 'requires_capture')->assertJsonPath('data.client_secret', null);
        $this->postJson("/api/bookings/{$bookingId}/payment-sync")->assertOk()->assertJsonPath('data.booking.status', 'requested');
        $this->postJson("/api/bookings/{$bookingId}/payment-sync")->assertOk()->assertJsonPath('data.booking.status', 'requested');
        $booking = Booking::where('public_id', $bookingId)->firstOrFail();
        $this->assertSame(1, $booking->statusLogs()->where('to_status', 'requested')->count());
        $therapistToken = $therapist->createToken('api')->plainTextToken;
        auth()->forgetGuards();
        $this->withToken($therapistToken)->postJson("/api/bookings/{$bookingId}/accept")->assertOk()->assertJsonPath('data.status', 'accepted');
        auth()->forgetGuards();
        $this->withToken($token)->postJson("/api/bookings/{$bookingId}/messages", ['body' => '待ち合わせの確認です'])->assertCreated();
        auth()->forgetGuards();
        $this->withToken($therapistToken)->getJson("/api/bookings/{$bookingId}/messages")->assertOk()->assertJsonPath('data.0.body', '待ち合わせの確認です');
        $this->postJson("/api/bookings/{$bookingId}/moving")->assertOk();
        $this->postJson("/api/bookings/{$bookingId}/arrived", ['arrival_confirmation_code' => $booking->refresh()->arrival_confirmation_code])->assertOk();
        $this->postJson("/api/bookings/{$bookingId}/start")->assertOk();
        $startedAt = now();
        $this->travel(60)->minutes();
        $this->postJson("/api/bookings/{$bookingId}/complete", ['started_at' => $startedAt->toIso8601String(), 'ended_at' => now()->toIso8601String()])->assertOk();
        auth()->forgetGuards();
        $this->withToken($token)->postJson("/api/bookings/{$bookingId}/user-complete-confirmation")->assertOk()->assertJsonPath('data.status', 'completed');
        $payment = $booking->currentPaymentIntent()->firstOrFail();
        $gateway = app(LocalPaymentIntentGateway::class);
        $state = $gateway->retrieve($payment);
        $this->assertSame('succeeded', $state['status']);
        $this->assertSame(12300, $state['refundable_amount']);
        $refund = Refund::create(['public_id' => 'refund_local_test', 'booking_id' => $booking->id,
            'payment_intent_id' => $payment->id, 'requested_by_account_id' => $user->id,
            'reason_code' => 'test', 'status' => 'approved', 'requested_amount' => 1000, 'approved_amount' => 1000]);
        $result = app(LocalRefundGateway::class)->create($refund, $payment, 1000);
        $refund->update(['status' => 'processed', 'stripe_refund_id' => $result->id]);
        $this->assertSame('succeeded', $result->status);
        $this->assertSame(11300, $gateway->retrieve($payment)['refundable_amount']);
        $this->assertSame($result->id, $gateway->findRefund($payment, $refund->public_id)['id']);
    }

    public function test_simulation_refuses_real_payment_ids(): void
    {
        $this->partialMock(LocalPaymentSimulation::class, fn ($mock) => $mock->shouldReceive('enabled')->andReturn(true));
        $this->expectException(\RuntimeException::class);
        app(LocalPaymentIntentGateway::class)->cancel(new PaymentIntent(['stripe_payment_intent_id' => 'pi_real']));
    }

    public function test_simulated_authorization_can_be_canceled_and_block_review_prevents_capture(): void
    {
        $this->partialMock(LocalPaymentSimulation::class, fn ($mock) => $mock->shouldReceive('enabled')->andReturn(true));
        [$user, $therapist, $token, $profile, $menu, $address] = $this->createBookableFixture();
        $quoteId = $this->withToken($token)->postJson('/api/booking-quotes', [
            'therapist_profile_id' => $profile, 'therapist_menu_id' => $menu,
            'service_address_id' => $address, 'duration_minutes' => 60, 'is_on_demand' => true,
        ])->assertCreated()->json('data.quote_id');
        $bookingId = $this->postJson('/api/bookings', ['quote_id' => $quoteId])->assertCreated()->json('data.public_id');
        $this->postJson("/api/bookings/{$bookingId}/payment-intents")->assertCreated();
        $this->postJson("/api/bookings/{$bookingId}/payment-abandon")->assertOk();
        $booking = Booking::where('public_id', $bookingId)->firstOrFail();
        $payment = $booking->paymentIntents()->firstOrFail();
        $this->assertSame('canceled', $payment->status);
        $payment->update(['status' => 'requires_capture']);
        $relationship = RoleRelationship::firstOrCreate(['user_account_id' => $user->id, 'therapist_account_id' => $therapist->id], ['public_id' => 'rel_local_test']);
        DB::table('block_booking_actions')->insert([
            'relationship_id' => $relationship->id,
            'booking_id' => $booking->id, 'status' => 'review', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->expectException(HttpException::class);
        app(LocalPaymentIntentGateway::class)->capture($payment);
    }

    private function createBookableFixture(bool $userVerified = true): array
    {
        $user = Account::factory()->create(['public_id' => 'acc_user_flow']);
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_flow']);
        $userToken = $user->createToken('api')->plainTextToken;
        $therapist->roleAssignments()->create([
            'role' => 'therapist',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        if ($userVerified) {
            IdentityVerification::create([
                'account_id' => $user->id,
                'status' => IdentityVerification::STATUS_APPROVED,
                'is_age_verified' => true,
                'submitted_at' => now()->subDay(),
                'reviewed_at' => now(),
            ]);
        }

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
