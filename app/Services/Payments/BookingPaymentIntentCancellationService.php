<?php

namespace App\Services\Payments;

use App\Contracts\Payments\PaymentIntentGateway;
use App\Models\Booking;
use App\Models\PaymentIntent;
use Carbon\CarbonInterface;

class BookingPaymentIntentCancellationService
{
    public function __construct(
        private readonly PaymentIntentGateway $paymentIntentGateway,
    ) {}

    public function cancelCurrentForBooking(
        Booking $booking,
        string $lastStripeEventId,
        ?CarbonInterface $now = null,
    ): ?PaymentIntent {
        $paymentIntent = PaymentIntent::query()
            ->where('booking_id', $booking->id)
            ->where('is_current', true)
            ->latest('id')
            ->first();

        if (! $paymentIntent) {
            return null;
        }

        return $this->cancel($paymentIntent, $lastStripeEventId, $now);
    }

    public function cancel(
        PaymentIntent $paymentIntent,
        string $lastStripeEventId,
        ?CarbonInterface $now = null,
    ): PaymentIntent {
        $now ??= now();

        if (
            blank($paymentIntent->stripe_payment_intent_id)
            || in_array($paymentIntent->status, [
                PaymentIntent::STRIPE_STATUS_SUCCEEDED,
                PaymentIntent::STRIPE_STATUS_CANCELED,
            ], true)
        ) {
            return $paymentIntent;
        }

        $paymentIntent->forceFill([
            'status' => $this->paymentIntentGateway->cancel($paymentIntent),
            'canceled_at' => $paymentIntent->canceled_at ?? $now,
            'last_stripe_event_id' => $lastStripeEventId,
        ])->save();

        return $paymentIntent->refresh();
    }
}
