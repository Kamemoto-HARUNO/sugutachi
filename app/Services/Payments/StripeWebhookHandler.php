<?php

namespace App\Services\Payments;

use App\Models\Booking;
use App\Models\PaymentIntent;
use App\Models\StripeWebhookEvent;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;
use Stripe\Event as StripeEvent;
use Throwable;

class StripeWebhookHandler
{
    public const EVENT_PAYMENT_INTENT_AUTHORIZED = 'payment_intent.amount_capturable_updated';

    public const EVENT_PAYMENT_INTENT_SUCCEEDED = 'payment_intent.succeeded';

    public const EVENT_PAYMENT_INTENT_CANCELED = 'payment_intent.canceled';

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
                    self::EVENT_PAYMENT_INTENT_AUTHORIZED,
                    self::EVENT_PAYMENT_INTENT_SUCCEEDED,
                    self::EVENT_PAYMENT_INTENT_CANCELED => $this->processPaymentIntentEvent(
                        payload: $payload,
                        eventType: (string) $event->type,
                        eventId: (string) $event->id,
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
