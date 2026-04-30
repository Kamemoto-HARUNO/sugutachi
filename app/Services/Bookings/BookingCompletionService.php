<?php

namespace App\Services\Bookings;

use App\Models\Account;
use App\Models\Booking;
use App\Models\PaymentIntent;
use App\Models\TherapistLedgerEntry;
use App\Contracts\Payments\PaymentIntentGateway;

class BookingCompletionService
{
    public function __construct(
        private readonly BookingStatusTransitionService $transition,
        private readonly PaymentIntentGateway $paymentIntentGateway,
        private readonly BookingSettlementCalculator $bookingSettlementCalculator,
    ) {
    }

    public function complete(
        Booking $booking,
        ?Account $actor,
        string $actorRole,
        string $reasonCode,
    ): Booking {
        $booking->loadMissing('currentPaymentIntent');
        $this->captureFinalAmount($booking);

        $booking = $this->transition->transition(
            booking: $booking,
            actor: $actor,
            actorRole: $actorRole,
            allowedFromStatuses: [Booking::STATUS_THERAPIST_COMPLETED],
            toStatus: Booking::STATUS_COMPLETED,
            reasonCode: $reasonCode,
            attributes: [
                'completed_at' => now(),
            ],
        );

        $booking->ledgerEntries()->firstOrCreate(
            [
                'entry_type' => TherapistLedgerEntry::TYPE_BOOKING_SALE,
            ],
            [
                'therapist_account_id' => $booking->therapist_account_id,
                'amount_signed' => $booking->therapist_net_amount,
                'status' => TherapistLedgerEntry::STATUS_PENDING,
                'available_at' => now()->addDays(3),
                'description' => null,
                'metadata_json' => [
                    'booking_public_id' => $booking->public_id,
                ],
            ],
        );

        return $booking->refresh();
    }

    private function captureFinalAmount(Booking $booking): void
    {
        $booking->loadMissing(['currentPaymentIntent', 'currentQuote']);
        $this->normalizeLegacyCaptureAmounts($booking);
        $paymentIntent = $booking->currentPaymentIntent;

        if (! $paymentIntent || blank($paymentIntent->stripe_payment_intent_id)) {
            return;
        }

        if ($paymentIntent->status !== PaymentIntent::STRIPE_STATUS_REQUIRES_CAPTURE) {
            return;
        }

        $paymentIntent->forceFill([
            'status' => $this->paymentIntentGateway->capture(
                $paymentIntent,
                $booking->total_amount,
                $paymentIntent->stripe_connected_account_id && (int) $booking->total_amount >= (int) $booking->therapist_net_amount
                    ? max(0, (int) $booking->total_amount - (int) $booking->therapist_net_amount)
                    : null,
                $paymentIntent->stripe_connected_account_id && (int) $booking->total_amount >= (int) $booking->therapist_net_amount
                    ? $booking->therapist_net_amount
                    : null,
            ),
            'captured_at' => $paymentIntent->captured_at ?? now(),
            'last_stripe_event_id' => 'system.booking_completed_captured',
        ])->save();
    }

    private function normalizeLegacyCaptureAmounts(Booking $booking): void
    {
        if (! $booking->currentPaymentIntent) {
            return;
        }

        $amounts = [
            'total_amount' => (int) ($booking->settlement_total_amount ?? $booking->total_amount),
            'therapist_net_amount' => (int) ($booking->settlement_therapist_net_amount ?? $booking->therapist_net_amount),
            'platform_fee_amount' => (int) ($booking->settlement_platform_fee_amount ?? $booking->platform_fee_amount),
            'matching_fee_amount' => (int) ($booking->settlement_matching_fee_amount ?? $booking->matching_fee_amount),
        ];

        $chargeableAmounts = $this->bookingSettlementCalculator->applyAuthorizationCap($booking, $amounts);

        $hasChanges =
            (int) $booking->total_amount !== (int) $chargeableAmounts['total_amount']
            || (int) $booking->therapist_net_amount !== (int) $chargeableAmounts['therapist_net_amount']
            || (int) $booking->platform_fee_amount !== (int) $chargeableAmounts['platform_fee_amount']
            || (int) $booking->matching_fee_amount !== (int) $chargeableAmounts['matching_fee_amount']
            || (int) ($booking->settlement_total_amount ?? 0) !== (int) $chargeableAmounts['settlement_total_amount']
            || (int) ($booking->settlement_therapist_net_amount ?? 0) !== (int) $chargeableAmounts['settlement_therapist_net_amount']
            || (int) ($booking->settlement_platform_fee_amount ?? 0) !== (int) $chargeableAmounts['settlement_platform_fee_amount']
            || (int) ($booking->settlement_matching_fee_amount ?? 0) !== (int) $chargeableAmounts['settlement_matching_fee_amount']
            || (int) ($booking->uncaptured_extension_amount ?? 0) !== (int) $chargeableAmounts['uncaptured_extension_amount'];

        if (! $hasChanges) {
            return;
        }

        $booking->forceFill([
            'total_amount' => $chargeableAmounts['total_amount'],
            'therapist_net_amount' => $chargeableAmounts['therapist_net_amount'],
            'platform_fee_amount' => $chargeableAmounts['platform_fee_amount'],
            'matching_fee_amount' => $chargeableAmounts['matching_fee_amount'],
            'settlement_total_amount' => $chargeableAmounts['settlement_total_amount'],
            'settlement_therapist_net_amount' => $chargeableAmounts['settlement_therapist_net_amount'],
            'settlement_platform_fee_amount' => $chargeableAmounts['settlement_platform_fee_amount'],
            'settlement_matching_fee_amount' => $chargeableAmounts['settlement_matching_fee_amount'],
            'uncaptured_extension_amount' => $chargeableAmounts['uncaptured_extension_amount'],
        ])->save();
    }
}
