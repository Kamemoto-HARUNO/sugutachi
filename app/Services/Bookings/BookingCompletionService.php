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
                'available_at' => now()->addDays(7),
                'description' => 'Booking sale pending release',
                'metadata_json' => [
                    'booking_public_id' => $booking->public_id,
                ],
            ],
        );

        return $booking->refresh();
    }

    private function captureFinalAmount(Booking $booking): void
    {
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
                $paymentIntent->stripe_connected_account_id
                    ? $booking->platform_fee_amount + $booking->matching_fee_amount
                    : null,
                $paymentIntent->stripe_connected_account_id
                    ? $booking->therapist_net_amount
                    : null,
            ),
            'captured_at' => $paymentIntent->captured_at ?? now(),
            'last_stripe_event_id' => 'system.booking_completed_captured',
        ])->save();
    }
}
