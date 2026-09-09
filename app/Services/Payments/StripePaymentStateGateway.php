<?php

namespace App\Services\Payments;

use App\Contracts\Payments\PaymentStateGateway;
use App\Models\PaymentIntent;
use Stripe\StripeClient;

class StripePaymentStateGateway implements PaymentStateGateway
{
    private function client(): StripeClient
    {
        $secret = config('services.stripe.secret');
        if (! $secret) {
            throw new \RuntimeException('Payment verification unavailable.');
        }

        return new StripeClient($secret);
    }

    public function retrieve(PaymentIntent $payment): array
    {
        $intent = $this->client()->paymentIntents->retrieve($payment->stripe_payment_intent_id, ['expand' => ['latest_charge']]);
        $charge = $intent->latest_charge;

        return ['status' => (string) $intent->status, 'refundable_amount' => max(0, (int) ($intent->amount_received ?? 0) - (int) ($charge?->amount_refunded ?? 0))];
    }

    public function findRefund(PaymentIntent $payment, string $publicId): ?array
    {
        foreach ($this->client()->refunds->all(['payment_intent' => $payment->stripe_payment_intent_id, 'limit' => 100])->autoPagingIterator() as $refund) {
            if (($refund->metadata->refund_public_id ?? null) === $publicId) {
                return ['id' => (string) $refund->id, 'status' => (string) $refund->status];
            }
        }

        return null;
    }

    public function refundStatus(string $refundId): string
    {
        return (string) $this->client()->refunds->retrieve($refundId)->status;
    }
}
