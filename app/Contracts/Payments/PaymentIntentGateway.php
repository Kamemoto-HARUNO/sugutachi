<?php

namespace App\Contracts\Payments;

use App\Models\Booking;
use App\Models\BookingQuote;
use App\Models\StripeConnectedAccount;

interface PaymentIntentGateway
{
    public function create(
        Booking $booking,
        BookingQuote $quote,
        ?StripeConnectedAccount $connectedAccount = null
    ): CreatedPaymentIntent;
}
