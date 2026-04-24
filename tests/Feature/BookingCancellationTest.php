<?php

namespace Tests\Feature;

use App\Contracts\Payments\CreatedPaymentIntent;
use App\Contracts\Payments\CreatedRefund;
use App\Contracts\Payments\PaymentIntentGateway;
use App\Contracts\Payments\RefundGateway;
use App\Models\Account;
use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\BookingQuote;
use App\Models\PaymentIntent;
use App\Models\Refund;
use App\Models\ServiceAddress;
use App\Models\StripeConnectedAccount;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Tests\TestCase;

class BookingCancellationTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_preview_and_cancel_before_acceptance_for_free(): void
    {
        $gatewayState = $this->bindPaymentGateways();

        [$user, , $booking, $paymentIntent] = $this->createBookingFixture(
            Booking::STATUS_REQUESTED,
            withPaymentIntent: true,
        );

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
        $this->assertDatabaseHas('therapist_profiles', [
            'id' => $booking->therapist_profile_id,
            'therapist_cancellation_count' => 0,
        ]);
        $this->assertDatabaseHas('payment_intents', [
            'id' => $paymentIntent->id,
            'status' => PaymentIntent::STRIPE_STATUS_CANCELED,
            'last_stripe_event_id' => 'system.user_booking_canceled',
        ]);
        $this->assertDatabaseHas('booking_status_logs', [
            'booking_id' => $booking->id,
            'from_status' => Booking::STATUS_REQUESTED,
            'to_status' => Booking::STATUS_CANCELED,
            'actor_role' => 'user',
            'reason_code' => 'user_schedule_changed',
        ]);
        $this->assertSame([$paymentIntent->stripe_payment_intent_id], $gatewayState->canceledStripeIds);
        $this->assertSame([], $gatewayState->capturedStripeIds);
        $this->assertSame([], $gatewayState->refundCalls);
    }

    public function test_user_cancel_within_24_hours_calculates_half_service_fee_plus_matching_fee(): void
    {
        $gatewayState = $this->bindPaymentGateways();

        [$user, , $booking, $paymentIntent] = $this->createBookingFixture(
            status: Booking::STATUS_ACCEPTED,
            scheduledStartAt: now()->addHours(4),
            withPaymentIntent: true,
        );

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/cancel-preview")
            ->assertOk()
            ->assertJsonPath('data.cancel_fee_amount', 6300)
            ->assertJsonPath('data.refund_amount', 6000)
            ->assertJsonPath('data.policy_code', 'within_24_hours_half')
            ->assertJsonPath('data.payment_action', 'capture_cancel_fee_and_refund_remaining');

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/cancel", [
                'reason_code' => 'user_schedule_changed',
            ])
            ->assertOk()
            ->assertJsonPath('data.booking.status', Booking::STATUS_CANCELED)
            ->assertJsonPath('data.cancellation.cancel_fee_amount', 6300)
            ->assertJsonPath('data.cancellation.refund_amount', 6000);

        $this->assertDatabaseHas('payment_intents', [
            'id' => $paymentIntent->id,
            'status' => PaymentIntent::STRIPE_STATUS_SUCCEEDED,
            'last_stripe_event_id' => 'system.booking_cancellation_captured',
        ]);
        $this->assertDatabaseHas('refunds', [
            'booking_id' => $booking->id,
            'payment_intent_id' => $paymentIntent->id,
            'status' => Refund::STATUS_PROCESSED,
            'reason_code' => 'booking_cancellation_auto',
            'requested_amount' => 6000,
            'approved_amount' => 6000,
            'stripe_refund_id' => 're_'.$booking->public_id,
        ]);
        $this->assertSame([$paymentIntent->stripe_payment_intent_id], $gatewayState->capturedStripeIds);
        $this->assertSame([], $gatewayState->canceledStripeIds);
        $this->assertSame([
            [
                'payment_intent_id' => $paymentIntent->stripe_payment_intent_id,
                'amount' => 6000,
            ],
        ], $gatewayState->refundCalls);
    }

    public function test_user_cancel_within_3_hours_captures_full_amount_without_refund(): void
    {
        $gatewayState = $this->bindPaymentGateways();

        [$user, , $booking, $paymentIntent] = $this->createBookingFixture(
            status: Booking::STATUS_ACCEPTED,
            scheduledStartAt: now()->addHours(2),
            withPaymentIntent: true,
        );

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/cancel", [
                'reason_code' => 'user_schedule_changed',
            ])
            ->assertOk()
            ->assertJsonPath('data.booking.status', Booking::STATUS_CANCELED)
            ->assertJsonPath('data.cancellation.cancel_fee_amount', 12300)
            ->assertJsonPath('data.cancellation.refund_amount', 0)
            ->assertJsonPath('data.cancellation.payment_action', 'capture_full_amount');

        $this->assertDatabaseHas('payment_intents', [
            'id' => $paymentIntent->id,
            'status' => PaymentIntent::STRIPE_STATUS_SUCCEEDED,
            'last_stripe_event_id' => 'system.booking_cancellation_captured',
        ]);
        $this->assertDatabaseMissing('refunds', [
            'booking_id' => $booking->id,
        ]);
        $this->assertSame([$paymentIntent->stripe_payment_intent_id], $gatewayState->capturedStripeIds);
        $this->assertSame([], $gatewayState->canceledStripeIds);
        $this->assertSame([], $gatewayState->refundCalls);
    }

    public function test_therapist_cancel_after_acceptance_is_full_refund(): void
    {
        $gatewayState = $this->bindPaymentGateways();

        [$user, $therapist, $booking, $paymentIntent] = $this->createBookingFixture(
            status: Booking::STATUS_ACCEPTED,
            scheduledStartAt: now()->addHours(2),
            withPaymentIntent: true,
        );

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/cancel-preview")
            ->assertOk()
            ->assertJsonPath('data.cancel_fee_amount', 0)
            ->assertJsonPath('data.refund_amount', 12300)
            ->assertJsonPath('data.policy_code', 'therapist_cancel_full_refund');

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/cancel", [
                'reason_code' => 'therapist_unavailable',
                'reason_note' => '急な体調不良のため、本日のご案内が難しくなりました。',
            ])
            ->assertOk()
            ->assertJsonPath('data.booking.status', Booking::STATUS_CANCELED)
            ->assertJsonPath('data.booking.cancel_reason_code', 'therapist_unavailable')
            ->assertJsonPath('data.booking.cancel_reason_note', '急な体調不良のため、本日のご案内が難しくなりました。');

        $this->assertDatabaseHas('therapist_profiles', [
            'id' => $booking->therapist_profile_id,
            'therapist_cancellation_count' => 1,
        ]);
        $this->assertDatabaseHas('payment_intents', [
            'id' => $paymentIntent->id,
            'status' => PaymentIntent::STRIPE_STATUS_CANCELED,
            'last_stripe_event_id' => 'system.therapist_booking_canceled',
        ]);
        $this->assertSame([$paymentIntent->stripe_payment_intent_id], $gatewayState->canceledStripeIds);
        $this->assertSame([], $gatewayState->capturedStripeIds);
        $this->assertSame([], $gatewayState->refundCalls);

        $booking->refresh();
        $this->assertSame(
            '急な体調不良のため、本日のご案内が難しくなりました。',
            Crypt::decryptString($booking->cancel_reason_note_encrypted),
        );
        $this->assertDatabaseHas('notifications', [
            'account_id' => $user->id,
            'notification_type' => 'booking_canceled_by_therapist',
            'channel' => 'in_app',
            'status' => 'sent',
        ]);

        $notification = AppNotification::query()
            ->where('account_id', $user->id)
            ->where('notification_type', 'booking_canceled_by_therapist')
            ->firstOrFail();

        $this->assertSame($booking->public_id, data_get($notification->data_json, 'booking_public_id'));
        $this->assertSame('therapist_unavailable', data_get($notification->data_json, 'reason_code'));
        $this->assertSame(
            '急な体調不良のため、本日のご案内が難しくなりました。',
            data_get($notification->data_json, 'reason_note'),
        );
    }

    public function test_therapist_cannot_cancel_before_acceptance(): void
    {
        [, $therapist, $booking] = $this->createBookingFixture(Booking::STATUS_REQUESTED);

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/cancel-preview")
            ->assertConflict();

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/cancel", [
                'reason_code' => 'therapist_unavailable',
            ])
            ->assertConflict();

        $this->assertDatabaseHas('therapist_profiles', [
            'id' => $booking->therapist_profile_id,
            'therapist_cancellation_count' => 0,
        ]);
    }

    public function test_therapist_cancel_requires_reason_note(): void
    {
        [, $therapist, $booking] = $this->createBookingFixture(
            status: Booking::STATUS_ACCEPTED,
            scheduledStartAt: now()->addHours(2),
        );

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/cancel", [
                'reason_code' => 'therapist_unavailable',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['reason_note']);
    }

    public function test_completed_booking_cannot_be_canceled(): void
    {
        [$user, , $booking] = $this->createBookingFixture(Booking::STATUS_COMPLETED);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/cancel-preview")
            ->assertConflict();
    }

    private function createBookingFixture(
        string $status,
        mixed $scheduledStartAt = null,
        bool $withPaymentIntent = false,
    ): array {
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

        $paymentIntent = $withPaymentIntent
            ? PaymentIntent::create([
                'booking_id' => $booking->id,
                'payer_account_id' => $user->id,
                'stripe_payment_intent_id' => 'pi_'.$booking->public_id,
                'status' => PaymentIntent::STRIPE_STATUS_REQUIRES_CAPTURE,
                'capture_method' => 'manual',
                'currency' => 'jpy',
                'amount' => 12300,
                'application_fee_amount' => 1500,
                'transfer_amount' => 10800,
                'is_current' => true,
                'authorized_at' => now()->subMinute(),
            ])
            : null;

        return [$user, $therapist, $booking, $paymentIntent];
    }

    private function bindPaymentGateways(): object
    {
        $gatewayState = (object) [
            'canceledStripeIds' => [],
            'capturedStripeIds' => [],
            'refundCalls' => [],
        ];

        $this->app->bind(PaymentIntentGateway::class, fn () => new class($gatewayState) implements PaymentIntentGateway
        {
            public function __construct(
                private readonly object $gatewayState,
            ) {}

            public function create(
                Booking $booking,
                BookingQuote $quote,
                ?StripeConnectedAccount $connectedAccount = null,
            ): CreatedPaymentIntent {
                return new CreatedPaymentIntent(
                    id: 'pi_unused_'.$booking->public_id,
                    clientSecret: null,
                    status: 'requires_payment_method',
                );
            }

            public function capture(PaymentIntent $paymentIntent): string
            {
                $this->gatewayState->capturedStripeIds[] = $paymentIntent->stripe_payment_intent_id;

                return PaymentIntent::STRIPE_STATUS_SUCCEEDED;
            }

            public function cancel(PaymentIntent $paymentIntent): string
            {
                $this->gatewayState->canceledStripeIds[] = $paymentIntent->stripe_payment_intent_id;

                return PaymentIntent::STRIPE_STATUS_CANCELED;
            }
        });

        $this->app->bind(RefundGateway::class, fn () => new class($gatewayState) implements RefundGateway
        {
            public function __construct(
                private readonly object $gatewayState,
            ) {}

            public function create(Refund $refund, PaymentIntent $paymentIntent, int $amount): CreatedRefund
            {
                $this->gatewayState->refundCalls[] = [
                    'payment_intent_id' => $paymentIntent->stripe_payment_intent_id,
                    'amount' => $amount,
                ];

                return new CreatedRefund(
                    id: 're_'.$refund->booking->public_id,
                    status: 'succeeded',
                );
            }
        });

        return $gatewayState;
    }
}
