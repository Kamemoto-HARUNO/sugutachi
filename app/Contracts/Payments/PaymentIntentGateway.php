<?php

namespace App\Contracts\Payments;

use App\Models\Booking;
use App\Models\BookingQuote;
use App\Models\PaymentIntent;
use App\Models\StripeConnectedAccount;

interface PaymentIntentGateway
{
    public function create(
        Booking $booking,
        BookingQuote $quote,
        ?StripeConnectedAccount $connectedAccount = null
    ): CreatedPaymentIntent;

    public function capture(PaymentIntent $paymentIntent): string;

    public function cancel(PaymentIntent $paymentIntent): string;
}
