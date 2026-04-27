<?php

namespace App\Services\Bookings;

use App\Models\Account;
use App\Models\Booking;
use App\Models\TherapistLedgerEntry;

class BookingCompletionService
{
    public function __construct(
        private readonly BookingStatusTransitionService $transition,
    ) {
    }

    public function complete(
        Booking $booking,
        ?Account $actor,
        string $actorRole,
        string $reasonCode,
    ): Booking {
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
}
