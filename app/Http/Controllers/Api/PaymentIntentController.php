<?php

namespace App\Http\Controllers\Api;

use App\Contracts\Payments\PaymentIntentGateway;
use App\Http\Controllers\Controller;
use App\Http\Resources\PaymentIntentResource;
use App\Models\Booking;
use App\Models\PaymentIntent;
use App\Services\Bookings\BookingSettlementCalculator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PaymentIntentController extends Controller
{
    public function store(
        Request $request,
        Booking $booking,
        PaymentIntentGateway $gateway,
        BookingSettlementCalculator $bookingSettlementCalculator,
    ): JsonResponse
    {
        abort_unless($booking->user_account_id === $request->user()->id, 404);
        abort_unless(
            $booking->status === Booking::STATUS_PAYMENT_AUTHORIZING,
            409,
            'Payment can only be created before the booking request is sent.'
        );

        $booking->load(['currentQuote', 'userAccount', 'therapistAccount', 'therapistProfile.stripeConnectedAccount']);
        $quote = $booking->currentQuote;

        abort_unless($quote, 409, 'Current quote is missing.');

        $authorizationAmounts = $bookingSettlementCalculator->calculateAuthorizationAmounts($quote);
        $authorizationQuote = clone $quote;
        $authorizationQuote->forceFill([
            'duration_minutes' => $authorizationAmounts['authorization_duration_minutes'],
            'base_amount' => $authorizationAmounts['base_amount'],
            'travel_fee_amount' => $authorizationAmounts['travel_fee_amount'],
            'night_fee_amount' => $authorizationAmounts['night_fee_amount'],
            'demand_fee_amount' => $authorizationAmounts['demand_fee_amount'],
            'profile_adjustment_amount' => $authorizationAmounts['profile_adjustment_amount'],
            'matching_fee_amount' => $authorizationAmounts['matching_fee_amount'],
            'platform_fee_amount' => $authorizationAmounts['platform_fee_amount'],
            'total_amount' => $authorizationAmounts['total_amount'],
            'therapist_gross_amount' => $authorizationAmounts['therapist_gross_amount'],
            'therapist_net_amount' => $authorizationAmounts['therapist_net_amount'],
        ]);

        $connectedAccount = $booking->therapistProfile->stripeConnectedAccount;
        $createdIntent = $gateway->create($booking, $authorizationQuote, $connectedAccount);

        $paymentIntent = DB::transaction(function () use ($booking, $quote, $authorizationQuote, $connectedAccount, $createdIntent): PaymentIntent {
            $booking->paymentIntents()->update(['is_current' => false]);

            return PaymentIntent::create([
                'booking_id' => $booking->id,
                'payer_account_id' => $booking->user_account_id,
                'stripe_payment_intent_id' => $createdIntent->id,
                'stripe_connected_account_id' => $connectedAccount?->id,
                'status' => $createdIntent->status,
                'capture_method' => 'manual',
                'currency' => config('services.stripe.currency', 'jpy'),
                'amount' => $authorizationQuote->total_amount,
                'application_fee_amount' => $connectedAccount?->canReceiveStripeTransfers()
                    ? $authorizationQuote->platform_fee_amount + $authorizationQuote->matching_fee_amount
                    : 0,
                'transfer_amount' => $connectedAccount?->canReceiveStripeTransfers()
                    ? $authorizationQuote->therapist_net_amount
                    : 0,
                'is_current' => true,
                'metadata_json' => [
                    'booking_public_id' => $booking->public_id,
                    'quote_public_id' => $quote->public_id,
                    'authorization_duration_minutes' => $authorizationQuote->duration_minutes,
                ],
            ]);
        });

        $paymentIntent->client_secret = $createdIntent->clientSecret;

        return (new PaymentIntentResource($paymentIntent))
            ->response()
            ->setStatusCode(201);
    }
}
