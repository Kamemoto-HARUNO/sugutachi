<?php

namespace App\Services\Bookings;

use App\Contracts\Payments\PaymentIntentGateway;
use App\Contracts\Payments\RefundGateway;
use App\Models\Booking;
use App\Models\PaymentIntent;
use App\Models\Refund;
use App\Services\Payments\BookingPaymentIntentCancellationService;
use Illuminate\Support\Str;

class BookingCancellationSettlementService
{
    private const AUTO_REFUND_REASON_CODE = 'booking_cancellation_auto';

    public function __construct(
        private readonly BookingPaymentIntentCancellationService $paymentIntentCancellationService,
        private readonly PaymentIntentGateway $paymentIntentGateway,
        private readonly RefundGateway $refundGateway,
    ) {}

    public function settle(Booking $booking, array $cancellation): void
    {
        $paymentAction = (string) ($cancellation['payment_action'] ?? '');

        if ($paymentAction === '') {
            return;
        }

        $paymentIntent = $booking->currentPaymentIntent
            ?: $booking->load('currentPaymentIntent')->currentPaymentIntent;

        if (! $paymentIntent) {
            return;
        }

        match ($paymentAction) {
            'void_authorization' => $this->paymentIntentCancellationService->cancelCurrentForBooking(
                booking: $booking,
                lastStripeEventId: $booking->canceled_by_account_id === $booking->therapist_account_id
                    ? 'system.therapist_booking_canceled'
                    : 'system.user_booking_canceled',
            ),
            'capture_full_amount' => $this->capture($paymentIntent, 'system.booking_cancellation_captured'),
            'capture_cancel_fee_and_refund_remaining' => $this->captureAndRefundRemaining(
                booking: $booking,
                paymentIntent: $paymentIntent,
                refundAmount: (int) ($cancellation['refund_amount'] ?? 0),
            ),
            default => null,
        };
    }

    private function captureAndRefundRemaining(Booking $booking, PaymentIntent $paymentIntent, int $refundAmount): void
    {
        $paymentIntent = $this->capture($paymentIntent, 'system.booking_cancellation_captured');

        if ($refundAmount <= 0) {
            return;
        }

        $refund = Refund::query()
            ->where('booking_id', $booking->id)
            ->where('payment_intent_id', $paymentIntent->id)
            ->where('reason_code', self::AUTO_REFUND_REASON_CODE)
            ->latest('id')
            ->first();

        if (! $refund) {
            $refund = Refund::create([
                'public_id' => 'ref_'.Str::ulid(),
                'booking_id' => $booking->id,
                'payment_intent_id' => $paymentIntent->id,
                'requested_by_account_id' => $booking->canceled_by_account_id ?: $booking->user_account_id,
                'status' => Refund::STATUS_REQUESTED,
                'reason_code' => self::AUTO_REFUND_REASON_CODE,
                'requested_amount' => $refundAmount,
            ]);
        }

        if ($refund->stripe_refund_id || $refund->status === Refund::STATUS_PROCESSED) {
            return;
        }

        $createdRefund = $this->refundGateway->create($refund, $paymentIntent, $refundAmount);

        $refund->forceFill([
            'status' => $createdRefund->status === 'succeeded'
                ? Refund::STATUS_PROCESSED
                : Refund::STATUS_APPROVED,
            'approved_amount' => $refundAmount,
            'stripe_refund_id' => $createdRefund->id,
            'reviewed_at' => now(),
            'processed_at' => $createdRefund->status === 'succeeded' ? now() : null,
        ])->save();
    }

    private function capture(PaymentIntent $paymentIntent, string $lastStripeEventId): PaymentIntent
    {
        if (
            blank($paymentIntent->stripe_payment_intent_id)
            || $paymentIntent->status === PaymentIntent::STRIPE_STATUS_CANCELED
        ) {
            return $paymentIntent;
        }

        if ($paymentIntent->status !== PaymentIntent::STRIPE_STATUS_SUCCEEDED) {
            $paymentIntent->forceFill([
                'status' => $this->paymentIntentGateway->capture($paymentIntent),
                'captured_at' => $paymentIntent->captured_at ?? now(),
                'last_stripe_event_id' => $lastStripeEventId,
            ])->save();
        }

        return $paymentIntent->refresh();
    }
}
