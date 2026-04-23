<?php

namespace App\Http\Controllers\Api;

use App\Contracts\Payments\PaymentIntentGateway;
use App\Http\Controllers\Controller;
use App\Http\Resources\PaymentIntentResource;
use App\Models\Booking;
use App\Models\PaymentIntent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PaymentIntentController extends Controller
{
    public function store(Request $request, Booking $booking, PaymentIntentGateway $gateway): JsonResponse
    {
        abort_unless($booking->user_account_id === $request->user()->id, 404);
        abort_unless($booking->status === 'requested', 409, 'Payment can only be created for requested bookings.');

        $booking->load(['currentQuote', 'userAccount', 'therapistAccount', 'therapistProfile.stripeConnectedAccount']);
        $quote = $booking->currentQuote;

        abort_unless($quote, 409, 'Current quote is missing.');

        $connectedAccount = $booking->therapistProfile->stripeConnectedAccount;
        $createdIntent = $gateway->create($booking, $quote, $connectedAccount);

        $paymentIntent = DB::transaction(function () use ($booking, $quote, $connectedAccount, $createdIntent): PaymentIntent {
            $booking->paymentIntents()->update(['is_current' => false]);

            return PaymentIntent::create([
                'booking_id' => $booking->id,
                'payer_account_id' => $booking->user_account_id,
                'stripe_payment_intent_id' => $createdIntent->id,
                'stripe_connected_account_id' => $connectedAccount?->id,
                'status' => $createdIntent->status,
                'capture_method' => 'manual',
                'currency' => config('services.stripe.currency', 'jpy'),
                'amount' => $quote->total_amount,
                'application_fee_amount' => $connectedAccount?->charges_enabled
                    ? $quote->platform_fee_amount + $quote->matching_fee_amount
                    : 0,
                'transfer_amount' => $connectedAccount?->charges_enabled
                    ? $quote->therapist_net_amount
                    : 0,
                'is_current' => true,
                'metadata_json' => [
                    'booking_public_id' => $booking->public_id,
                    'quote_public_id' => $quote->public_id,
                ],
            ]);
        });

        $paymentIntent->client_secret = $createdIntent->clientSecret;

        return (new PaymentIntentResource($paymentIntent))
            ->response()
            ->setStatusCode(201);
    }
}
