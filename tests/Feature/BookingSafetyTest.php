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
use App\Models\LegalDocument;
use App\Models\PaymentIntent;
use App\Models\Refund;
use App\Models\Report;
use App\Models\ServiceAddress;
use App\Models\StripeConnectedAccount;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BookingSafetyTest extends TestCase
{
    use RefreshDatabase;

    public function test_participants_can_record_booking_consents_and_health_checks(): void
    {
        [$user, $therapist, $booking] = $this->createSafetyBookingFixture(status: Booking::STATUS_ACCEPTED);

        $legalDocument = LegalDocument::create([
            'public_id' => 'ldc_booking_safety_terms',
            'document_type' => 'terms',
            'version' => '2026-04-24',
            'title' => '利用規約',
            'body' => 'test',
            'published_at' => now(),
            'effective_at' => now(),
        ]);

        $userToken = $user->createToken('api')->plainTextToken;
        $this->withToken($userToken)
            ->postJson("/api/bookings/{$booking->public_id}/consents", [
                'consent_type' => 'relaxation_purpose_acknowledged',
                'legal_document_id' => $legalDocument->public_id,
            ])
            ->assertCreated()
            ->assertJsonPath('data.consent_type', 'relaxation_purpose_acknowledged')
            ->assertJsonPath('data.legal_document_public_id', $legalDocument->public_id);

        $this->withToken($userToken)
            ->postJson("/api/bookings/{$booking->public_id}/consents", [
                'consent_type' => 'relaxation_purpose_acknowledged',
                'legal_document_id' => $legalDocument->public_id,
            ])
            ->assertOk();

        $this->withToken($userToken)
            ->postJson("/api/bookings/{$booking->public_id}/health-checks", [
                'drinking_status' => 'none',
                'has_injury' => false,
                'has_fever' => false,
                'contraindications' => ['首まわりは避けたい'],
                'notes' => '今日は軽めの力加減でお願いします。',
            ])
            ->assertCreated()
            ->assertJsonPath('data.role', 'user')
            ->assertJsonPath('data.contraindications.0', '首まわりは避けたい')
            ->assertJsonPath('data.notes', '今日は軽めの力加減でお願いします。');

        $this->assertDatabaseCount('booking_consents', 1);
        $this->assertDatabaseHas('booking_health_checks', [
            'booking_id' => $booking->id,
            'account_id' => $user->id,
            'role' => 'user',
            'drinking_status' => 'none',
        ]);

        $this->withToken($userToken)
            ->getJson("/api/bookings/{$booking->public_id}")
            ->assertOk()
            ->assertJsonPath('data.consents.0.consent_type', 'relaxation_purpose_acknowledged')
            ->assertJsonPath('data.consents.0.legal_document_public_id', $legalDocument->public_id)
            ->assertJsonPath('data.health_checks.0.role', 'user')
            ->assertJsonPath('data.health_checks.0.notes', '今日は軽めの力加減でお願いします。');
    }

    public function test_therapist_can_interrupt_booking_and_create_safety_report(): void
    {
        $gatewayState = $this->bindPaymentGateways();

        [$user, $therapist, $booking, $paymentIntent] = $this->createSafetyBookingFixture(
            status: Booking::STATUS_ARRIVED,
            withPaymentIntent: true,
        );

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/interrupt", [
                'reason_code' => 'safety_concern',
                'reason_note' => '体調不良が見られたため施術を継続できませんでした。',
                'responsibility' => 'therapist',
            ])
            ->assertOk()
            ->assertJsonPath('data.booking.status', Booking::STATUS_INTERRUPTED)
            ->assertJsonPath('data.booking.cancel_reason_code', 'safety_concern')
            ->assertJsonPath('data.booking.interruption_reason_code', 'safety_concern')
            ->assertJsonPath('data.booking.current_payment_intent.status', PaymentIntent::STRIPE_STATUS_CANCELED)
            ->assertJsonPath('data.report.category', 'booking_interrupted')
            ->assertJsonPath('data.report.target_account_id', $user->public_id)
            ->assertJsonPath('data.interruption.payment_action', 'void_authorization');

        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => Booking::STATUS_INTERRUPTED,
            'cancel_reason_code' => 'safety_concern',
            'interruption_reason_code' => 'safety_concern',
            'canceled_by_account_id' => $therapist->id,
        ]);
        $this->assertDatabaseHas('reports', [
            'booking_id' => $booking->id,
            'reporter_account_id' => $therapist->id,
            'target_account_id' => $user->id,
            'category' => 'booking_interrupted',
            'status' => Report::STATUS_OPEN,
        ]);
        $this->assertDatabaseHas('notifications', [
            'account_id' => $user->id,
            'notification_type' => 'booking_interrupted',
            'channel' => 'in_app',
            'status' => 'sent',
        ]);
        $this->assertDatabaseHas('payment_intents', [
            'id' => $paymentIntent->id,
            'status' => PaymentIntent::STRIPE_STATUS_CANCELED,
            'last_stripe_event_id' => 'system.therapist_booking_canceled',
        ]);
        $this->assertSame([$paymentIntent->stripe_payment_intent_id], $gatewayState->canceledStripeIds);

        $notification = AppNotification::query()
            ->where('account_id', $user->id)
            ->where('notification_type', 'booking_interrupted')
            ->firstOrFail();

        $this->assertSame($booking->public_id, data_get($notification->data_json, 'booking_public_id'));
        $this->assertSame('therapist', data_get($notification->data_json, 'responsibility'));
        $this->assertSame('therapist', data_get($notification->data_json, 'interrupted_by_role'));
    }

    public function test_user_can_interrupt_accepted_booking_when_therapist_does_not_show(): void
    {
        $gatewayState = $this->bindPaymentGateways();

        [$user, $therapist, $booking, $paymentIntent] = $this->createSafetyBookingFixture(
            status: Booking::STATUS_ACCEPTED,
            withPaymentIntent: true,
        );

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/interrupt", [
                'reason_code' => 'therapist_no_show',
                'reason_note' => '予定時刻を過ぎてもセラピストが来ず、連絡もつきませんでした。',
                'responsibility' => 'therapist',
            ])
            ->assertOk()
            ->assertJsonPath('data.booking.status', Booking::STATUS_INTERRUPTED)
            ->assertJsonPath('data.booking.current_payment_intent.status', PaymentIntent::STRIPE_STATUS_CANCELED)
            ->assertJsonPath('data.interruption.payment_action', 'void_authorization');

        $this->assertSame([$paymentIntent->stripe_payment_intent_id], $gatewayState->canceledStripeIds);
    }

    public function test_therapist_can_interrupt_moving_booking_when_user_does_not_show(): void
    {
        $gatewayState = $this->bindPaymentGateways();

        [$user, $therapist, $booking, $paymentIntent] = $this->createSafetyBookingFixture(
            status: Booking::STATUS_MOVING,
            withPaymentIntent: true,
        );

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/interrupt", [
                'reason_code' => 'user_no_show',
                'reason_note' => '待ち合わせ場所に向かって待機しましたが、利用者と会えませんでした。',
                'responsibility' => 'user',
            ])
            ->assertOk()
            ->assertJsonPath('data.booking.status', Booking::STATUS_INTERRUPTED)
            ->assertJsonPath('data.booking.current_payment_intent.status', PaymentIntent::STRIPE_STATUS_SUCCEEDED)
            ->assertJsonPath('data.interruption.payment_action', 'capture_full_amount');

        $this->assertSame([$paymentIntent->stripe_payment_intent_id], $gatewayState->capturedStripeIds);
    }

    public function test_user_interrupt_can_capture_full_amount(): void
    {
        $gatewayState = $this->bindPaymentGateways();

        [$user, $therapist, $booking, $paymentIntent] = $this->createSafetyBookingFixture(
            status: Booking::STATUS_IN_PROGRESS,
            withPaymentIntent: true,
        );

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/interrupt", [
                'reason_code' => 'user_requested_stop',
                'reason_note' => 'これ以上の継続が難しくなりました。',
                'responsibility' => 'user',
            ])
            ->assertOk()
            ->assertJsonPath('data.booking.status', Booking::STATUS_INTERRUPTED)
            ->assertJsonPath('data.booking.current_payment_intent.status', PaymentIntent::STRIPE_STATUS_SUCCEEDED)
            ->assertJsonPath('data.interruption.payment_action', 'capture_full_amount');

        $this->assertDatabaseHas('payment_intents', [
            'id' => $paymentIntent->id,
            'status' => PaymentIntent::STRIPE_STATUS_SUCCEEDED,
            'last_stripe_event_id' => 'system.booking_cancellation_captured',
        ]);
        $this->assertDatabaseHas('notifications', [
            'account_id' => $therapist->id,
            'notification_type' => 'booking_interrupted',
            'channel' => 'in_app',
            'status' => 'sent',
        ]);
        $this->assertSame([$paymentIntent->stripe_payment_intent_id], $gatewayState->capturedStripeIds);
        $this->assertSame([], $gatewayState->refundCalls);
    }

    private function createSafetyBookingFixture(
        string $status,
        bool $withPaymentIntent = false,
    ): array {
        $user = Account::factory()->create(['public_id' => 'acc_user_safety_'.fake()->unique()->numerify('###')]);
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_safety_'.fake()->unique()->numerify('###')]);

        $therapistProfile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_safety_'.fake()->unique()->numerify('###'),
            'public_name' => 'Safety Therapist',
            'profile_status' => 'approved',
        ]);

        $menu = TherapistMenu::create([
            'public_id' => 'menu_safety_'.fake()->unique()->numerify('###'),
            'therapist_profile_id' => $therapistProfile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
        ]);

        $address = ServiceAddress::create([
            'public_id' => 'addr_safety_'.fake()->unique()->numerify('###'),
            'account_id' => $user->id,
            'place_type' => 'hotel',
            'address_line_encrypted' => 'encrypted-address',
            'lat' => '35.6812360',
            'lng' => '139.7671250',
        ]);

        $booking = Booking::create([
            'public_id' => 'book_safety_'.fake()->unique()->numerify('###'),
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $address->id,
            'status' => $status,
            'is_on_demand' => true,
            'requested_start_at' => now()->subHour(),
            'scheduled_start_at' => now()->subHour(),
            'scheduled_end_at' => now(),
            'duration_minutes' => 60,
            'accepted_at' => now()->subHours(2),
            'confirmed_at' => now()->subHours(2),
            'moving_at' => in_array($status, [Booking::STATUS_MOVING, Booking::STATUS_ARRIVED, Booking::STATUS_IN_PROGRESS], true)
                ? now()->subMinutes(40)
                : null,
            'arrived_at' => in_array($status, [Booking::STATUS_ARRIVED, Booking::STATUS_IN_PROGRESS], true)
                ? now()->subMinutes(20)
                : null,
            'started_at' => $status === Booking::STATUS_IN_PROGRESS ? now()->subMinutes(10) : null,
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
                'authorized_at' => now()->subMinutes(30),
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

            public function capture(
                PaymentIntent $paymentIntent,
                ?int $amountToCapture = null,
                ?int $applicationFeeAmount = null,
                ?int $transferAmount = null,
            ): string
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
