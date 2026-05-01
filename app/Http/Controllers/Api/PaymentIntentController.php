<?php

namespace App\Http\Controllers\Api;

use App\Contracts\Payments\PaymentIntentGateway;
use App\Http\Controllers\Controller;
use App\Http\Resources\PaymentIntentResource;
use App\Models\Booking;
use App\Models\BookingQuote;
use App\Models\PaymentIntent;
use App\Services\Campaigns\CampaignService;
use App\Services\Bookings\BookingSettlementCalculator;
use App\Services\Payments\BookingPaymentIntentCancellationService;
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
            'カード確認は、予約リクエスト送信前にだけ開始できます。'
        );

        $booking->load(['currentQuote', 'userAccount', 'therapistAccount', 'therapistProfile.stripeConnectedAccount']);
        $quote = $booking->currentQuote;

        abort_unless($quote, 409, '現在の見積もりが見つかりません。');

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
            'discount_amount' => $authorizationAmounts['discount_amount'],
            'total_amount' => $authorizationAmounts['total_amount'],
            'therapist_gross_amount' => $authorizationAmounts['therapist_gross_amount'],
            'therapist_net_amount' => $authorizationAmounts['therapist_net_amount'],
        ]);

        $connectedAccount = $booking->therapistProfile->stripeConnectedAccount;
        $canUseStripeTransferSplit = (bool) (
            $connectedAccount?->canReceiveStripeTransfers()
            && (int) $quote->total_amount >= (int) $quote->therapist_net_amount
            && (int) $authorizationQuote->total_amount >= (int) $authorizationQuote->therapist_net_amount
        );
        $createdIntent = $gateway->create(
            $booking,
            $authorizationQuote,
            $canUseStripeTransferSplit ? $connectedAccount : null,
        );

        $paymentIntent = DB::transaction(function () use ($booking, $quote, $authorizationQuote, $connectedAccount, $createdIntent, $canUseStripeTransferSplit): PaymentIntent {
            $booking->paymentIntents()->update(['is_current' => false]);

            return PaymentIntent::create([
                'booking_id' => $booking->id,
                'payer_account_id' => $booking->user_account_id,
                'stripe_payment_intent_id' => $createdIntent->id,
                'stripe_connected_account_id' => $canUseStripeTransferSplit ? $connectedAccount?->id : null,
                'status' => $createdIntent->status,
                'capture_method' => 'manual',
                'currency' => config('services.stripe.currency', 'jpy'),
                'amount' => $authorizationQuote->total_amount,
                'application_fee_amount' => $canUseStripeTransferSplit
                    ? max(0, (int) $authorizationQuote->total_amount - (int) $authorizationQuote->therapist_net_amount)
                    : 0,
                'transfer_amount' => $canUseStripeTransferSplit
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

    public function abandon(
        Request $request,
        Booking $booking,
        BookingPaymentIntentCancellationService $bookingPaymentIntentCancellationService,
        CampaignService $campaignService,
    ): JsonResponse {
        abort_unless($booking->user_account_id === $request->user()->id, 404);
        abort_unless(
            $booking->status === Booking::STATUS_PAYMENT_AUTHORIZING,
            409,
            'カード確認中の予約だけ中止できます。'
        );

        $abandonedBooking = DB::transaction(function () use ($booking, $bookingPaymentIntentCancellationService, $campaignService): Booking {
            $lockedBooking = Booking::query()
                ->whereKey($booking->id)
                ->lockForUpdate()
                ->firstOrFail();

            abort_unless(
                $lockedBooking->status === Booking::STATUS_PAYMENT_AUTHORIZING,
                409,
                'カード確認中の予約だけ中止できます。'
            );

            $currentPaymentIntent = $bookingPaymentIntentCancellationService->cancelCurrentForBooking(
                booking: $lockedBooking,
                lastStripeEventId: 'system.payment_authorization_abandoned',
            );

            if ($lockedBooking->current_quote_id) {
                BookingQuote::query()
                    ->whereKey($lockedBooking->current_quote_id)
                    ->lockForUpdate()
                    ->update([
                        'booking_id' => null,
                        'updated_at' => now(),
                    ]);
            }

            $lockedBooking->forceFill([
                'status' => Booking::STATUS_PAYMENT_CANCELED,
                'current_quote_id' => null,
                'request_expires_at' => null,
                'canceled_at' => $lockedBooking->canceled_at ?? now(),
                'cancel_reason_code' => 'payment_authorization_failed',
                'canceled_by_account_id' => null,
            ])->save();

            $lockedBooking->statusLogs()->create([
                'from_status' => Booking::STATUS_PAYMENT_AUTHORIZING,
                'to_status' => Booking::STATUS_PAYMENT_CANCELED,
                'actor_account_id' => $lockedBooking->user_account_id,
                'actor_role' => 'user',
                'reason_code' => 'payment_authorization_failed',
                'metadata_json' => [
                    'stripe_payment_intent_id' => $currentPaymentIntent?->stripe_payment_intent_id,
                ],
            ]);

            $campaignService->restoreBookingCampaignApplication($lockedBooking->refresh(), 'payment_authorization_failed');
            return $lockedBooking->refresh()->load([
                'currentPaymentIntent',
                'currentQuote',
                'canceledBy',
                'refunds' => fn ($query) => $query->latest('id'),
            ]);
        });

        return response()->json([
            'data' => (new \App\Http\Resources\BookingResource($abandonedBooking))->resolve($request),
        ]);
    }
}
