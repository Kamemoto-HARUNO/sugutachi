<?php

namespace App\Services\Payments;

use App\Contracts\Payments\CreatedRefund;
use App\Contracts\Payments\RefundGateway;
use App\Models\PaymentIntent;
use App\Models\Refund;
use RuntimeException;
use Stripe\StripeClient;

class StripeRefundGateway implements RefundGateway
{
    public function create(Refund $refund, PaymentIntent $paymentIntent, int $amount): CreatedRefund
    {
        $secret = config('services.stripe.secret');

        if (! $secret) {
            throw new RuntimeException('Stripe secret key is not configured.');
        }

        $stripeRefund = (new StripeClient($secret))->refunds->create([
            'payment_intent' => $paymentIntent->stripe_payment_intent_id,
            'amount' => $amount,
            'metadata' => [
                'refund_public_id' => $refund->public_id,
                'booking_id' => (string) $refund->booking_id,
                'payment_intent_id' => (string) $paymentIntent->id,
            ],
            ...($refund->reason_code === 'therapist_relationship_block' && $paymentIntent->stripe_connected_account_id ? ['reverse_transfer' => true, 'refund_application_fee' => true] : []),
        ], ['idempotency_key' => 'refund:'.$refund->public_id]);

        return new CreatedRefund(
            id: $stripeRefund->id,
            status: $stripeRefund->status,
        );
    }
}
