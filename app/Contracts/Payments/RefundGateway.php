<?php

namespace App\Contracts\Payments;

use App\Models\PaymentIntent;
use App\Models\Refund;

interface RefundGateway
{
    public function create(Refund $refund, PaymentIntent $paymentIntent, int $amount): CreatedRefund;
}
