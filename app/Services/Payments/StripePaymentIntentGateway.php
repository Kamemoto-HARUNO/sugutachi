<?php

namespace App\Services\Payments;

use App\Contracts\Payments\CreatedPaymentIntent;
use App\Contracts\Payments\PaymentIntentGateway;
use App\Models\Booking;
use App\Models\BookingQuote;
use App\Models\StripeConnectedAccount;
use RuntimeException;
use Stripe\StripeClient;

class StripePaymentIntentGateway implements PaymentIntentGateway
{
    public function create(
        Booking $booking,
        BookingQuote $quote,
        ?StripeConnectedAccount $connectedAccount = null
    ): CreatedPaymentIntent {
        $secret = config('services.stripe.secret');

        if (! $secret) {
            throw new RuntimeException('Stripe secret key is not configured.');
        }

        $payload = [
            'amount' => $quote->total_amount,
            'currency' => config('services.stripe.currency', 'jpy'),
            'capture_method' => 'manual',
            'automatic_payment_methods' => [
                'enabled' => true,
            ],
            'metadata' => [
                'booking_public_id' => $booking->public_id,
                'quote_public_id' => $quote->public_id,
                'user_account_public_id' => $booking->userAccount->public_id,
                'therapist_account_public_id' => $booking->therapistAccount->public_id,
            ],
        ];

        if ($connectedAccount?->stripe_account_id && $connectedAccount->charges_enabled) {
            $payload['application_fee_amount'] = $quote->platform_fee_amount + $quote->matching_fee_amount;
            $payload['transfer_data'] = [
                'destination' => $connectedAccount->stripe_account_id,
            ];
        }

        $intent = (new StripeClient($secret))->paymentIntents->create($payload);

        return new CreatedPaymentIntent(
            id: $intent->id,
            clientSecret: $intent->client_secret,
            status: $intent->status,
        );
    }
}
