<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Booking;
use App\Models\PaymentIntent;
use App\Models\PayoutRequest;
use App\Models\Refund;
use App\Models\ServiceAddress;
use App\Models\StripeConnectedAccount;
use App\Models\StripeDispute;
use App\Models\StripeWebhookEvent;
use App\Models\TherapistLedgerEntry;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class StripeWebhookTest extends TestCase
{
    use RefreshDatabase;

    public function test_payment_intent_authorization_webhook_marks_booking_requested(): void
    {
        config()->set('services.stripe.webhook_secret', 'whsec_test');

        [$booking, $paymentIntent] = $this->createPaymentIntentFixture();
        $payload = $this->paymentIntentPayload(
            eventId: 'evt_authorized',
            type: 'payment_intent.amount_capturable_updated',
            stripePaymentIntentId: $paymentIntent->stripe_payment_intent_id,
            status: PaymentIntent::STRIPE_STATUS_REQUIRES_CAPTURE,
        );

        $this->sendStripeWebhook($payload)
            ->assertOk()
            ->assertJsonPath('received', true)
            ->assertJsonPath('status', StripeWebhookEvent::STATUS_PROCESSED);

        $paymentIntent->refresh();
        $booking->refresh();

        $this->assertSame(PaymentIntent::STRIPE_STATUS_REQUIRES_CAPTURE, $paymentIntent->status);
        $this->assertSame('evt_authorized', $paymentIntent->last_stripe_event_id);
        $this->assertNotNull($paymentIntent->authorized_at);
        $this->assertSame(Booking::STATUS_REQUESTED, $booking->status);
        $this->assertNotNull($booking->request_expires_at);
        $this->assertDatabaseHas('booking_status_logs', [
            'booking_id' => $booking->id,
            'from_status' => Booking::STATUS_PAYMENT_AUTHORIZING,
            'to_status' => Booking::STATUS_REQUESTED,
            'actor_role' => 'system',
            'reason_code' => 'payment_authorized',
        ]);
        $this->assertDatabaseHas('stripe_webhook_events', [
            'stripe_event_id' => 'evt_authorized',
            'event_type' => 'payment_intent.amount_capturable_updated',
            'processed_status' => StripeWebhookEvent::STATUS_PROCESSED,
        ]);

        $this->sendStripeWebhook($payload)->assertOk();

        $this->assertDatabaseCount('stripe_webhook_events', 1);
        $this->assertDatabaseCount('booking_status_logs', 1);
    }

    public function test_payment_intent_succeeded_webhook_updates_capture_status(): void
    {
        config()->set('services.stripe.webhook_secret', 'whsec_test');

        [$booking, $paymentIntent] = $this->createPaymentIntentFixture(Booking::STATUS_COMPLETED);
        $payload = $this->paymentIntentPayload(
            eventId: 'evt_succeeded',
            type: 'payment_intent.succeeded',
            stripePaymentIntentId: $paymentIntent->stripe_payment_intent_id,
            status: PaymentIntent::STRIPE_STATUS_SUCCEEDED,
        );

        $this->sendStripeWebhook($payload)
            ->assertOk()
            ->assertJsonPath('status', StripeWebhookEvent::STATUS_PROCESSED);

        $paymentIntent->refresh();
        $booking->refresh();

        $this->assertSame(PaymentIntent::STRIPE_STATUS_SUCCEEDED, $paymentIntent->status);
        $this->assertSame('evt_succeeded', $paymentIntent->last_stripe_event_id);
        $this->assertNotNull($paymentIntent->captured_at);
        $this->assertSame(Booking::STATUS_COMPLETED, $booking->status);
    }

    public function test_payment_intent_canceled_webhook_cancels_pending_booking(): void
    {
        config()->set('services.stripe.webhook_secret', 'whsec_test');

        [$booking, $paymentIntent] = $this->createPaymentIntentFixture(Booking::STATUS_REQUESTED);
        $payload = $this->paymentIntentPayload(
            eventId: 'evt_canceled',
            type: 'payment_intent.canceled',
            stripePaymentIntentId: $paymentIntent->stripe_payment_intent_id,
            status: PaymentIntent::STRIPE_STATUS_CANCELED,
        );

        $this->sendStripeWebhook($payload)
            ->assertOk()
            ->assertJsonPath('status', StripeWebhookEvent::STATUS_PROCESSED);

        $paymentIntent->refresh();
        $booking->refresh();

        $this->assertSame(PaymentIntent::STRIPE_STATUS_CANCELED, $paymentIntent->status);
        $this->assertSame('evt_canceled', $paymentIntent->last_stripe_event_id);
        $this->assertNotNull($paymentIntent->canceled_at);
        $this->assertSame(Booking::STATUS_PAYMENT_CANCELED, $booking->status);
        $this->assertSame('payment_intent_canceled', $booking->cancel_reason_code);
    }

    public function test_stripe_webhook_rejects_invalid_signature(): void
    {
        config()->set('services.stripe.webhook_secret', 'whsec_test');

        $payload = $this->paymentIntentPayload(
            eventId: 'evt_invalid_signature',
            type: 'payment_intent.succeeded',
            stripePaymentIntentId: 'pi_missing',
            status: PaymentIntent::STRIPE_STATUS_SUCCEEDED,
        );

        $this->call('POST', '/webhooks/stripe', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_STRIPE_SIGNATURE' => 'bad-signature',
        ], $payload)->assertBadRequest();

        $this->assertDatabaseCount('stripe_webhook_events', 0);
    }

    public function test_account_updated_webhook_syncs_connected_account_status(): void
    {
        config()->set('services.stripe.webhook_secret', 'whsec_test');

        $therapist = Account::factory()->create(['public_id' => 'acc_connect_therapist']);
        $therapistProfile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_connect',
            'public_name' => 'Connect Therapist',
            'profile_status' => 'approved',
        ]);
        $connectedAccount = StripeConnectedAccount::create([
            'account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'stripe_account_id' => 'acct_webhook',
            'account_type' => 'express',
            'status' => StripeConnectedAccount::STATUS_PENDING,
        ]);

        $payload = $this->accountUpdatedPayload(
            eventId: 'evt_account_updated',
            stripeAccountId: $connectedAccount->stripe_account_id,
            chargesEnabled: true,
            payoutsEnabled: false,
            detailsSubmitted: true,
            currentlyDue: ['external_account'],
        );

        $this->sendStripeWebhook($payload)
            ->assertOk()
            ->assertJsonPath('status', StripeWebhookEvent::STATUS_PROCESSED);

        $connectedAccount->refresh();

        $this->assertSame(StripeConnectedAccount::STATUS_REQUIREMENTS_DUE, $connectedAccount->status);
        $this->assertTrue($connectedAccount->charges_enabled);
        $this->assertFalse($connectedAccount->payouts_enabled);
        $this->assertTrue($connectedAccount->details_submitted);
        $this->assertSame(['external_account'], $connectedAccount->requirements_currently_due_json);
        $this->assertSame([], $connectedAccount->requirements_past_due_json);
        $this->assertNull($connectedAccount->disabled_reason);
        $this->assertNotNull($connectedAccount->onboarding_completed_at);
        $this->assertNotNull($connectedAccount->last_synced_at);
        $this->assertDatabaseHas('stripe_webhook_events', [
            'stripe_event_id' => 'evt_account_updated',
            'event_type' => 'account.updated',
            'processed_status' => StripeWebhookEvent::STATUS_PROCESSED,
        ]);
    }

    public function test_charge_refunded_webhook_records_processed_refund(): void
    {
        config()->set('services.stripe.webhook_secret', 'whsec_test');

        [, $paymentIntent] = $this->createPaymentIntentFixture(Booking::STATUS_COMPLETED);
        $paymentIntent->update([
            'status' => PaymentIntent::STRIPE_STATUS_SUCCEEDED,
            'captured_at' => now(),
        ]);

        $payload = $this->chargeRefundedPayload(
            eventId: 'evt_charge_refunded',
            stripePaymentIntentId: $paymentIntent->stripe_payment_intent_id,
            stripeRefundId: 're_webhook',
            amount: 5000,
        );

        $this->sendStripeWebhook($payload)
            ->assertOk()
            ->assertJsonPath('status', StripeWebhookEvent::STATUS_PROCESSED);

        $this->assertDatabaseHas('refunds', [
            'booking_id' => $paymentIntent->booking_id,
            'payment_intent_id' => $paymentIntent->id,
            'requested_by_account_id' => $paymentIntent->payer_account_id,
            'status' => Refund::STATUS_PROCESSED,
            'stripe_refund_id' => 're_webhook',
            'approved_amount' => 5000,
        ]);
    }

    public function test_dispute_webhooks_create_and_close_stripe_dispute(): void
    {
        config()->set('services.stripe.webhook_secret', 'whsec_test');

        [, $paymentIntent] = $this->createPaymentIntentFixture(Booking::STATUS_COMPLETED);
        $evidenceDueBy = now()->addDays(7)->timestamp;

        $this->sendStripeWebhook($this->disputePayload(
            eventId: 'evt_dispute_created',
            type: 'charge.dispute.created',
            stripeDisputeId: 'dp_webhook',
            stripePaymentIntentId: $paymentIntent->stripe_payment_intent_id,
            status: StripeDispute::STATUS_NEEDS_RESPONSE,
            outcome: null,
            evidenceDueBy: $evidenceDueBy,
        ))
            ->assertOk()
            ->assertJsonPath('status', StripeWebhookEvent::STATUS_PROCESSED);

        $this->assertDatabaseHas('stripe_disputes', [
            'booking_id' => $paymentIntent->booking_id,
            'payment_intent_id' => $paymentIntent->id,
            'stripe_dispute_id' => 'dp_webhook',
            'status' => StripeDispute::STATUS_NEEDS_RESPONSE,
            'reason' => 'fraudulent',
            'amount' => 12300,
            'currency' => 'jpy',
            'last_stripe_event_id' => 'evt_dispute_created',
        ]);

        $this->sendStripeWebhook($this->disputePayload(
            eventId: 'evt_dispute_closed',
            type: 'charge.dispute.closed',
            stripeDisputeId: 'dp_webhook',
            stripePaymentIntentId: $paymentIntent->stripe_payment_intent_id,
            status: StripeDispute::STATUS_WON,
            outcome: 'won',
            evidenceDueBy: $evidenceDueBy,
        ))
            ->assertOk()
            ->assertJsonPath('status', StripeWebhookEvent::STATUS_PROCESSED);

        $this->assertDatabaseHas('stripe_disputes', [
            'stripe_dispute_id' => 'dp_webhook',
            'status' => StripeDispute::STATUS_WON,
            'outcome' => 'won',
            'last_stripe_event_id' => 'evt_dispute_closed',
        ]);
    }

    public function test_payout_webhooks_mark_paid_and_failed_payout_requests(): void
    {
        config()->set('services.stripe.webhook_secret', 'whsec_test');

        [$paidPayoutRequest, $paidLedgerEntry] = $this->createPayoutWebhookFixture('paid', 'po_webhook_paid');

        $this->sendStripeWebhook($this->payoutPayload(
            eventId: 'evt_payout_paid',
            type: 'payout.paid',
            stripePayoutId: 'po_webhook_paid',
            status: 'paid',
        ))
            ->assertOk()
            ->assertJsonPath('status', StripeWebhookEvent::STATUS_PROCESSED);

        $this->assertSame(PayoutRequest::STATUS_PAID, $paidPayoutRequest->refresh()->status);
        $this->assertSame(TherapistLedgerEntry::STATUS_PAID, $paidLedgerEntry->refresh()->status);

        [$failedPayoutRequest, $failedLedgerEntry] = $this->createPayoutWebhookFixture('failed', 'po_webhook_failed');

        $this->sendStripeWebhook($this->payoutPayload(
            eventId: 'evt_payout_failed',
            type: 'payout.failed',
            stripePayoutId: 'po_webhook_failed',
            status: 'failed',
            failureCode: 'bank_account_closed',
        ))
            ->assertOk()
            ->assertJsonPath('status', StripeWebhookEvent::STATUS_PROCESSED);

        $this->assertSame(PayoutRequest::STATUS_FAILED, $failedPayoutRequest->refresh()->status);
        $this->assertSame('bank_account_closed', $failedPayoutRequest->failure_reason);
        $this->assertSame(TherapistLedgerEntry::STATUS_AVAILABLE, $failedLedgerEntry->refresh()->status);
        $this->assertNull($failedLedgerEntry->payout_request_id);
    }

    private function createPaymentIntentFixture(string $bookingStatus = Booking::STATUS_PAYMENT_AUTHORIZING): array
    {
        $user = Account::factory()->create(['public_id' => 'acc_user_webhook']);
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_webhook']);

        $therapistProfile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_webhook',
            'public_name' => 'Webhook Therapist',
            'profile_status' => 'approved',
        ]);

        $menu = TherapistMenu::create([
            'public_id' => 'menu_webhook_60',
            'therapist_profile_id' => $therapistProfile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
        ]);

        $address = ServiceAddress::create([
            'public_id' => 'addr_webhook',
            'account_id' => $user->id,
            'place_type' => 'hotel',
            'address_line_encrypted' => 'encrypted-address',
            'lat' => '35.6812360',
            'lng' => '139.7671250',
        ]);

        $booking = Booking::create([
            'public_id' => 'book_webhook',
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $address->id,
            'status' => $bookingStatus,
            'duration_minutes' => 60,
            'request_expires_at' => $bookingStatus === Booking::STATUS_REQUESTED ? now()->addMinutes(10) : null,
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);

        $paymentIntent = PaymentIntent::create([
            'booking_id' => $booking->id,
            'payer_account_id' => $user->id,
            'stripe_payment_intent_id' => 'pi_webhook',
            'status' => 'requires_payment_method',
            'capture_method' => 'manual',
            'currency' => 'jpy',
            'amount' => 12300,
            'application_fee_amount' => 1500,
            'transfer_amount' => 10800,
            'is_current' => true,
        ]);

        return [$booking, $paymentIntent];
    }

    private function createPayoutWebhookFixture(string $suffix, string $stripePayoutId): array
    {
        $therapist = Account::factory()->create(['public_id' => "acc_payout_webhook_{$suffix}"]);

        $therapistProfile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => "thp_payout_webhook_{$suffix}",
            'public_name' => 'Webhook Payout Therapist',
            'profile_status' => 'approved',
        ]);

        $connectedAccount = StripeConnectedAccount::create([
            'account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'stripe_account_id' => "acct_payout_webhook_{$suffix}",
            'account_type' => 'express',
            'status' => StripeConnectedAccount::STATUS_ACTIVE,
            'charges_enabled' => true,
            'payouts_enabled' => true,
            'details_submitted' => true,
        ]);

        $payoutRequest = PayoutRequest::create([
            'public_id' => "pay_webhook_{$suffix}",
            'therapist_account_id' => $therapist->id,
            'stripe_connected_account_id' => $connectedAccount->id,
            'status' => PayoutRequest::STATUS_PROCESSING,
            'requested_amount' => 10800,
            'net_amount' => 10800,
            'requested_at' => now()->subDays(3),
            'scheduled_process_date' => now()->subDay(),
            'processed_at' => now()->subHour(),
            'stripe_payout_id' => $stripePayoutId,
        ]);

        $ledgerEntry = TherapistLedgerEntry::create([
            'therapist_account_id' => $therapist->id,
            'payout_request_id' => $payoutRequest->id,
            'entry_type' => TherapistLedgerEntry::TYPE_BOOKING_SALE,
            'amount_signed' => 10800,
            'status' => TherapistLedgerEntry::STATUS_PAYOUT_REQUESTED,
        ]);

        return [$payoutRequest, $ledgerEntry];
    }

    private function paymentIntentPayload(
        string $eventId,
        string $type,
        string $stripePaymentIntentId,
        string $status,
    ): string {
        return json_encode([
            'id' => $eventId,
            'object' => 'event',
            'type' => $type,
            'data' => [
                'object' => [
                    'id' => $stripePaymentIntentId,
                    'object' => 'payment_intent',
                    'status' => $status,
                    'amount' => 12300,
                    'currency' => 'jpy',
                ],
            ],
        ], JSON_THROW_ON_ERROR);
    }

    private function accountUpdatedPayload(
        string $eventId,
        string $stripeAccountId,
        bool $chargesEnabled,
        bool $payoutsEnabled,
        bool $detailsSubmitted,
        array $currentlyDue = [],
        array $pastDue = [],
        ?string $disabledReason = null,
    ): string {
        return json_encode([
            'id' => $eventId,
            'object' => 'event',
            'type' => 'account.updated',
            'data' => [
                'object' => [
                    'id' => $stripeAccountId,
                    'object' => 'account',
                    'charges_enabled' => $chargesEnabled,
                    'payouts_enabled' => $payoutsEnabled,
                    'details_submitted' => $detailsSubmitted,
                    'requirements' => [
                        'currently_due' => $currentlyDue,
                        'past_due' => $pastDue,
                        'disabled_reason' => $disabledReason,
                    ],
                ],
            ],
        ], JSON_THROW_ON_ERROR);
    }

    private function chargeRefundedPayload(
        string $eventId,
        string $stripePaymentIntentId,
        string $stripeRefundId,
        int $amount,
    ): string {
        return json_encode([
            'id' => $eventId,
            'object' => 'event',
            'type' => 'charge.refunded',
            'data' => [
                'object' => [
                    'id' => 'ch_webhook',
                    'object' => 'charge',
                    'payment_intent' => $stripePaymentIntentId,
                    'amount_refunded' => $amount,
                    'refunds' => [
                        'object' => 'list',
                        'data' => [
                            [
                                'id' => $stripeRefundId,
                                'object' => 'refund',
                                'amount' => $amount,
                                'status' => 'succeeded',
                                'reason' => 'requested_by_customer',
                            ],
                        ],
                    ],
                ],
            ],
        ], JSON_THROW_ON_ERROR);
    }

    private function disputePayload(
        string $eventId,
        string $type,
        string $stripeDisputeId,
        string $stripePaymentIntentId,
        string $status,
        ?string $outcome,
        int $evidenceDueBy,
    ): string {
        return json_encode([
            'id' => $eventId,
            'object' => 'event',
            'type' => $type,
            'data' => [
                'object' => [
                    'id' => $stripeDisputeId,
                    'object' => 'dispute',
                    'payment_intent' => $stripePaymentIntentId,
                    'status' => $status,
                    'reason' => 'fraudulent',
                    'amount' => 12300,
                    'currency' => 'jpy',
                    'evidence_details' => [
                        'due_by' => $evidenceDueBy,
                    ],
                    'outcome' => $outcome ? [
                        'type' => $outcome,
                    ] : null,
                ],
            ],
        ], JSON_THROW_ON_ERROR);
    }

    private function payoutPayload(
        string $eventId,
        string $type,
        string $stripePayoutId,
        string $status,
        ?string $failureCode = null,
    ): string {
        return json_encode([
            'id' => $eventId,
            'object' => 'event',
            'type' => $type,
            'data' => [
                'object' => [
                    'id' => $stripePayoutId,
                    'object' => 'payout',
                    'status' => $status,
                    'amount' => 10800,
                    'currency' => 'jpy',
                    'failure_code' => $failureCode,
                ],
            ],
        ], JSON_THROW_ON_ERROR);
    }

    private function sendStripeWebhook(string $payload): TestResponse
    {
        return $this->call('POST', '/webhooks/stripe', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_STRIPE_SIGNATURE' => $this->stripeSignature($payload, 'whsec_test'),
        ], $payload);
    }

    private function stripeSignature(string $payload, string $secret): string
    {
        $timestamp = time();
        $signature = hash_hmac('sha256', "{$timestamp}.{$payload}", $secret);

        return "t={$timestamp},v1={$signature}";
    }
}
