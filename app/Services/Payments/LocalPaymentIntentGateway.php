<?php

namespace App\Services\Payments;

use App\Contracts\Payments\CreatedPaymentIntent;
use App\Contracts\Payments\PaymentStateGateway;
use App\Models\Booking;
use App\Models\BookingQuote;
use App\Models\PaymentIntent;
use App\Models\Refund;
use App\Models\StripeConnectedAccount;
use Illuminate\Support\Str;

class LocalPaymentIntentGateway extends StripePaymentIntentGateway implements PaymentStateGateway
{
    public function create(Booking $booking, BookingQuote $quote, ?StripeConnectedAccount $connectedAccount = null): CreatedPaymentIntent
    {
        app(LocalPaymentSimulation::class)->assertEnabled();

        return new CreatedPaymentIntent('pi_local_'.Str::ulid(), null, PaymentIntent::STRIPE_STATUS_REQUIRES_CAPTURE);
    }

    protected function captureAuthorized(PaymentIntent $paymentIntent, ?int $amountToCapture, ?int $applicationFeeAmount, ?int $transferAmount): string
    {
        app(LocalPaymentSimulation::class)->assertEnabled($paymentIntent->stripe_payment_intent_id);
        abort_unless(in_array($paymentIntent->status, ['requires_capture', 'succeeded'], true), 409);
        $amount = $amountToCapture ?? $paymentIntent->amount;
        abort_unless($amount > 0 && $amount <= $paymentIntent->amount, 422);
        $paymentIntent->forceFill(['metadata_json' => array_merge($paymentIntent->metadata_json ?? [], ['local_captured_amount' => $amount])])->save();

        return PaymentIntent::STRIPE_STATUS_SUCCEEDED;
    }

    public function cancel(PaymentIntent $paymentIntent): string
    {
        app(LocalPaymentSimulation::class)->assertEnabled($paymentIntent->stripe_payment_intent_id);
        abort_if($paymentIntent->status === PaymentIntent::STRIPE_STATUS_SUCCEEDED, 409);

        return PaymentIntent::STRIPE_STATUS_CANCELED;
    }

    public function retrieve(PaymentIntent $payment): array
    {
        app(LocalPaymentSimulation::class)->assertEnabled($payment->stripe_payment_intent_id);
        $payment->refresh();
        $refunded = Refund::where('payment_intent_id', $payment->id)->where('status', Refund::STATUS_PROCESSED)->sum('approved_amount');

        return ['status' => $payment->status, 'refundable_amount' => $payment->status === 'succeeded'
            ? max(0, (int) ($payment->metadata_json['local_captured_amount'] ?? $payment->amount) - $refunded) : 0];
    }

    public function findRefund(PaymentIntent $payment, string $publicId): ?array
    {
        app(LocalPaymentSimulation::class)->assertEnabled($payment->stripe_payment_intent_id);
        $refund = Refund::where('payment_intent_id', $payment->id)->where('public_id', $publicId)->first();

        return $refund?->stripe_refund_id ? ['id' => $refund->stripe_refund_id, 'status' => $this->refundStatus($refund->stripe_refund_id)] : null;
    }

    public function refundStatus(string $refundId): string
    {
        app(LocalPaymentSimulation::class)->assertEnabled();
        abort_unless(str_starts_with($refundId, 're_local_'), 409);

        return 'succeeded';
    }
}
