<?php

namespace App\Services\Payments;

use App\Contracts\Payments\CreatedRefund;
use App\Contracts\Payments\RefundGateway;
use App\Models\PaymentIntent;
use App\Models\Refund;

class LocalRefundGateway implements RefundGateway
{
    public function create(Refund $refund, PaymentIntent $paymentIntent, int $amount): CreatedRefund
    {
        $state = app(LocalPaymentIntentGateway::class)->retrieve($paymentIntent);
        abort_unless($refund->payment_intent_id === $paymentIntent->id && $amount > 0 && $amount <= $state['refundable_amount'], 422);

        return new CreatedRefund('re_local_'.$refund->public_id, 'succeeded');
    }
}
