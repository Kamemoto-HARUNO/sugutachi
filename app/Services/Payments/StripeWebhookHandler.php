<?php

namespace App\Services\Payments;

use App\Models\Booking;
use App\Models\PaymentIntent;
use App\Models\PayoutRequest;
use App\Models\Refund;
use App\Models\StripeConnectedAccount;
use App\Models\StripeDispute;
use App\Models\StripeWebhookEvent;
use App\Models\TherapistLedgerEntry;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;
use Stripe\Event as StripeEvent;
use Throwable;

class StripeWebhookHandler
{
    public const EVENT_ACCOUNT_UPDATED = 'account.updated';

    public const EVENT_CHARGE_REFUNDED = 'charge.refunded';

    public const EVENT_CHARGE_DISPUTE_CREATED = 'charge.dispute.created';

    public const EVENT_CHARGE_DISPUTE_CLOSED = 'charge.dispute.closed';

    public const EVENT_PAYMENT_INTENT_AUTHORIZED = 'payment_intent.amount_capturable_updated';

    public const EVENT_PAYMENT_INTENT_SUCCEEDED = 'payment_intent.succeeded';

    public const EVENT_PAYMENT_INTENT_CANCELED = 'payment_intent.canceled';

    public const EVENT_PAYOUT_FAILED = 'payout.failed';

    public const EVENT_PAYOUT_PAID = 'payout.paid';

    public function __construct(
        private readonly StripeConnectedAccountSynchronizer $connectedAccountSynchronizer,
    ) {}

    public function handle(StripeEvent $event): StripeWebhookEvent
    {
        $payload = $event->toArray();

        $webhookEvent = StripeWebhookEvent::query()->firstOrCreate(
            ['stripe_event_id' => (string) $event->id],
            [
                'event_type' => (string) $event->type,
                'payload_json' => $payload,
                'processed_status' => StripeWebhookEvent::STATUS_PENDING,
            ],
        );

        try {
            return DB::transaction(function () use ($event, $payload, $webhookEvent): StripeWebhookEvent {
                $lockedWebhookEvent = StripeWebhookEvent::query()
                    ->whereKey($webhookEvent->id)
                    ->lockForUpdate()
                    ->firstOrFail();

                if (in_array(
                    $lockedWebhookEvent->processed_status,
                    [StripeWebhookEvent::STATUS_PROCESSED, StripeWebhookEvent::STATUS_IGNORED],
                    true
                )) {
                    return $lockedWebhookEvent;
                }

                $processedStatus = match ($event->type) {
                    self::EVENT_ACCOUNT_UPDATED => $this->processAccountUpdatedEvent(
                        payload: $payload,
                    ),
                    self::EVENT_CHARGE_REFUNDED => $this->processChargeRefundedEvent(
                        payload: $payload,
                    ),
                    self::EVENT_CHARGE_DISPUTE_CREATED,
                    self::EVENT_CHARGE_DISPUTE_CLOSED => $this->processDisputeEvent(
                        payload: $payload,
                        eventId: (string) $event->id,
                    ),
                    self::EVENT_PAYMENT_INTENT_AUTHORIZED,
                    self::EVENT_PAYMENT_INTENT_SUCCEEDED,
                    self::EVENT_PAYMENT_INTENT_CANCELED => $this->processPaymentIntentEvent(
                        payload: $payload,
                        eventType: (string) $event->type,
                        eventId: (string) $event->id,
                    ),
                    self::EVENT_PAYOUT_FAILED,
                    self::EVENT_PAYOUT_PAID => $this->processPayoutEvent(
                        payload: $payload,
                        eventType: (string) $event->type,
                    ),
                    default => StripeWebhookEvent::STATUS_IGNORED,
                };

                $lockedWebhookEvent->forceFill([
                    'processed_status' => $processedStatus,
                    'processed_at' => now(),
                    'failure_reason' => null,
                ])->save();

                return $lockedWebhookEvent->refresh();
            });
        } catch (Throwable $exception) {
            StripeWebhookEvent::query()
                ->whereKey($webhookEvent->id)
                ->update([
                    'processed_status' => StripeWebhookEvent::STATUS_FAILED,
                    'failure_reason' => Str::limit($exception->getMessage(), 5000, ''),
                    'retry_count' => DB::raw('retry_count + 1'),
                    'updated_at' => now(),
                ]);

            throw $exception;
        }
    }

    private function processPaymentIntentEvent(array $payload, string $eventType, string $eventId): string
    {
        $stripePaymentIntent = $payload['data']['object'] ?? null;

        if (! is_array($stripePaymentIntent) || blank($stripePaymentIntent['id'] ?? null)) {
            throw new RuntimeException('Stripe webhook payload is missing a PaymentIntent object.');
        }

        $paymentIntent = PaymentIntent::query()
            ->with('booking')
            ->where('stripe_payment_intent_id', (string) $stripePaymentIntent['id'])
            ->lockForUpdate()
            ->first();

        if (! $paymentIntent) {
            throw new RuntimeException("PaymentIntent [{$stripePaymentIntent['id']}] was not found.");
        }

        $this->assertPaymentIntentMatches($paymentIntent, $stripePaymentIntent);

        $status = (string) ($stripePaymentIntent['status'] ?? $this->fallbackPaymentIntentStatus($eventType));
        $attributes = [
            'status' => $status,
            'last_stripe_event_id' => $eventId,
        ];

        if ($eventType === self::EVENT_PAYMENT_INTENT_AUTHORIZED) {
            $attributes['authorized_at'] = $paymentIntent->authorized_at ?? now();
        }

        if ($eventType === self::EVENT_PAYMENT_INTENT_SUCCEEDED) {
            $attributes['captured_at'] = $paymentIntent->captured_at ?? now();
        }

        if ($eventType === self::EVENT_PAYMENT_INTENT_CANCELED) {
            $attributes['canceled_at'] = $paymentIntent->canceled_at ?? now();
        }

        $paymentIntent->forceFill($attributes)->save();

        if ($eventType === self::EVENT_PAYMENT_INTENT_AUTHORIZED) {
            $this->markBookingRequested($paymentIntent->booking, $eventId);
        }

        if ($eventType === self::EVENT_PAYMENT_INTENT_CANCELED) {
            $this->markBookingPaymentCanceled($paymentIntent->booking, $eventId);
        }

        return StripeWebhookEvent::STATUS_PROCESSED;
    }

    private function processAccountUpdatedEvent(array $payload): string
    {
        $stripeAccount = $payload['data']['object'] ?? null;

        if (! is_array($stripeAccount) || blank($stripeAccount['id'] ?? null)) {
            throw new RuntimeException('Stripe webhook payload is missing an Account object.');
        }

        $connectedAccount = StripeConnectedAccount::query()
            ->where('stripe_account_id', (string) $stripeAccount['id'])
            ->lockForUpdate()
            ->first();

        if (! $connectedAccount) {
            throw new RuntimeException("Stripe Connected Account [{$stripeAccount['id']}] was not found.");
        }

        $this->connectedAccountSynchronizer->syncFromStripeAccount($connectedAccount, $stripeAccount);

        return StripeWebhookEvent::STATUS_PROCESSED;
    }

    private function processChargeRefundedEvent(array $payload): string
    {
        $charge = $payload['data']['object'] ?? null;

        if (! is_array($charge) || blank($charge['payment_intent'] ?? null)) {
            throw new RuntimeException('Stripe webhook payload is missing a Charge payment_intent.');
        }

        $paymentIntent = $this->paymentIntentForStripeId((string) $charge['payment_intent']);
        $stripeRefunds = $charge['refunds']['data'] ?? [];

        if (! is_array($stripeRefunds) || $stripeRefunds === []) {
            throw new RuntimeException('Stripe charge.refunded payload is missing refund data.');
        }

        foreach ($stripeRefunds as $stripeRefund) {
            if (! is_array($stripeRefund) || blank($stripeRefund['id'] ?? null)) {
                continue;
            }

            $status = match ((string) ($stripeRefund['status'] ?? '')) {
                'succeeded' => Refund::STATUS_PROCESSED,
                'failed', 'canceled' => Refund::STATUS_REJECTED,
                default => Refund::STATUS_APPROVED,
            };
            $amount = (int) ($stripeRefund['amount'] ?? $charge['amount_refunded'] ?? 0);
            $refund = Refund::query()
                ->where('stripe_refund_id', (string) $stripeRefund['id'])
                ->first() ?? new Refund([
                    'public_id' => 'ref_'.Str::ulid(),
                    'booking_id' => $paymentIntent->booking_id,
                    'payment_intent_id' => $paymentIntent->id,
                    'requested_by_account_id' => $paymentIntent->payer_account_id,
                    'reason_code' => (string) ($stripeRefund['reason'] ?? 'stripe_refund'),
                    'requested_amount' => $amount,
                ]);

            $refund->forceFill([
                'booking_id' => $paymentIntent->booking_id,
                'payment_intent_id' => $paymentIntent->id,
                'status' => $status,
                'approved_amount' => $amount,
                'stripe_refund_id' => (string) $stripeRefund['id'],
                'processed_at' => $status === Refund::STATUS_PROCESSED
                    ? ($refund->processed_at ?? now())
                    : null,
            ])->save();
        }

        return StripeWebhookEvent::STATUS_PROCESSED;
    }

    private function processDisputeEvent(array $payload, string $eventId): string
    {
        $stripeDispute = $payload['data']['object'] ?? null;

        if (! is_array($stripeDispute) || blank($stripeDispute['id'] ?? null)) {
            throw new RuntimeException('Stripe webhook payload is missing a Dispute object.');
        }

        $paymentIntent = filled($stripeDispute['payment_intent'] ?? null)
            ? $this->paymentIntentForStripeId((string) $stripeDispute['payment_intent'])
            : null;

        $evidenceDueBy = $stripeDispute['evidence_details']['due_by'] ?? null;
        $outcome = $stripeDispute['outcome']['type'] ?? null;

        StripeDispute::query()->updateOrCreate(
            ['stripe_dispute_id' => (string) $stripeDispute['id']],
            [
                'booking_id' => $paymentIntent?->booking_id,
                'payment_intent_id' => $paymentIntent?->id,
                'status' => (string) ($stripeDispute['status'] ?? 'unknown'),
                'reason' => $stripeDispute['reason'] ?? null,
                'amount' => (int) ($stripeDispute['amount'] ?? 0),
                'currency' => strtolower((string) ($stripeDispute['currency'] ?? 'jpy')),
                'evidence_due_by' => is_numeric($evidenceDueBy)
                    ? CarbonImmutable::createFromTimestamp((int) $evidenceDueBy)
                    : null,
                'outcome' => filled($outcome) ? (string) $outcome : null,
                'last_stripe_event_id' => $eventId,
            ],
        );

        return StripeWebhookEvent::STATUS_PROCESSED;
    }

    private function processPayoutEvent(array $payload, string $eventType): string
    {
        $stripePayout = $payload['data']['object'] ?? null;

        if (! is_array($stripePayout) || blank($stripePayout['id'] ?? null)) {
            throw new RuntimeException('Stripe webhook payload is missing a Payout object.');
        }

        $payoutRequest = PayoutRequest::query()
            ->where('stripe_payout_id', (string) $stripePayout['id'])
            ->lockForUpdate()
            ->first();

        if (! $payoutRequest) {
            throw new RuntimeException("PayoutRequest for Stripe Payout [{$stripePayout['id']}] was not found.");
        }

        if ($eventType === self::EVENT_PAYOUT_PAID) {
            $payoutRequest->forceFill([
                'status' => PayoutRequest::STATUS_PAID,
                'failure_reason' => null,
                'processed_at' => $payoutRequest->processed_at ?? now(),
            ])->save();

            $payoutRequest->ledgerEntries()->update([
                'status' => TherapistLedgerEntry::STATUS_PAID,
                'updated_at' => now(),
            ]);

            return StripeWebhookEvent::STATUS_PROCESSED;
        }

        $failureReason = $stripePayout['failure_message'] ?? $stripePayout['failure_code'] ?? 'stripe_payout_failed';

        $payoutRequest->forceFill([
            'status' => PayoutRequest::STATUS_FAILED,
            'failure_reason' => (string) $failureReason,
            'processed_at' => $payoutRequest->processed_at ?? now(),
        ])->save();

        $payoutRequest->ledgerEntries()->update([
            'payout_request_id' => null,
            'status' => TherapistLedgerEntry::STATUS_AVAILABLE,
            'updated_at' => now(),
        ]);

        return StripeWebhookEvent::STATUS_PROCESSED;
    }

    private function assertPaymentIntentMatches(PaymentIntent $paymentIntent, array $stripePaymentIntent): void
    {
        if (isset($stripePaymentIntent['amount']) && (int) $stripePaymentIntent['amount'] !== $paymentIntent->amount) {
            throw new RuntimeException("PaymentIntent [{$paymentIntent->stripe_payment_intent_id}] amount mismatch.");
        }

        $stripeCurrency = $stripePaymentIntent['currency'] ?? null;

        if ($stripeCurrency && strtolower((string) $stripeCurrency) !== strtolower($paymentIntent->currency)) {
            throw new RuntimeException("PaymentIntent [{$paymentIntent->stripe_payment_intent_id}] currency mismatch.");
        }
    }

    private function paymentIntentForStripeId(string $stripePaymentIntentId): PaymentIntent
    {
        $paymentIntent = PaymentIntent::query()
            ->where('stripe_payment_intent_id', $stripePaymentIntentId)
            ->lockForUpdate()
            ->first();

        if (! $paymentIntent) {
            throw new RuntimeException("PaymentIntent [{$stripePaymentIntentId}] was not found.");
        }

        return $paymentIntent;
    }

    private function fallbackPaymentIntentStatus(string $eventType): string
    {
        return match ($eventType) {
            self::EVENT_PAYMENT_INTENT_AUTHORIZED => PaymentIntent::STRIPE_STATUS_REQUIRES_CAPTURE,
            self::EVENT_PAYMENT_INTENT_SUCCEEDED => PaymentIntent::STRIPE_STATUS_SUCCEEDED,
            self::EVENT_PAYMENT_INTENT_CANCELED => PaymentIntent::STRIPE_STATUS_CANCELED,
            default => throw new RuntimeException("Unsupported PaymentIntent event [{$eventType}]."),
        };
    }

    private function markBookingRequested(Booking $booking, string $eventId): void
    {
        $lockedBooking = Booking::query()
            ->whereKey($booking->id)
            ->lockForUpdate()
            ->firstOrFail();

        if ($lockedBooking->status !== Booking::STATUS_PAYMENT_AUTHORIZING) {
            return;
        }

        $lockedBooking->forceFill([
            'status' => Booking::STATUS_REQUESTED,
            'request_expires_at' => now()->addMinutes(10),
        ])->save();

        $lockedBooking->statusLogs()->create([
            'from_status' => Booking::STATUS_PAYMENT_AUTHORIZING,
            'to_status' => Booking::STATUS_REQUESTED,
            'actor_role' => 'system',
            'reason_code' => 'payment_authorized',
            'metadata_json' => [
                'stripe_event_id' => $eventId,
            ],
        ]);
    }

    private function markBookingPaymentCanceled(Booking $booking, string $eventId): void
    {
        $lockedBooking = Booking::query()
            ->whereKey($booking->id)
            ->lockForUpdate()
            ->firstOrFail();

        if (! in_array($lockedBooking->status, [Booking::STATUS_PAYMENT_AUTHORIZING, Booking::STATUS_REQUESTED], true)) {
            return;
        }

        $fromStatus = $lockedBooking->status;

        $lockedBooking->forceFill([
            'status' => Booking::STATUS_PAYMENT_CANCELED,
            'request_expires_at' => null,
            'canceled_at' => $lockedBooking->canceled_at ?? now(),
            'cancel_reason_code' => 'payment_intent_canceled',
        ])->save();

        $lockedBooking->statusLogs()->create([
            'from_status' => $fromStatus,
            'to_status' => Booking::STATUS_PAYMENT_CANCELED,
            'actor_role' => 'system',
            'reason_code' => 'payment_intent_canceled',
            'metadata_json' => [
                'stripe_event_id' => $eventId,
            ],
        ]);
    }
}
