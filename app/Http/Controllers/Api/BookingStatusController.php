<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BookingResource;
use App\Models\Booking;
use App\Models\TherapistLedgerEntry;
use App\Services\Bookings\BookingStatusTransitionService;
use Illuminate\Http\Request;

class BookingStatusController extends Controller
{
    public function accept(Request $request, Booking $booking, BookingStatusTransitionService $transition): BookingResource
    {
        $this->authorizeTherapist($request, $booking);

        $booking = $transition->transition(
            booking: $booking,
            actor: $request->user(),
            actorRole: 'therapist',
            allowedFromStatuses: [Booking::STATUS_REQUESTED],
            toStatus: Booking::STATUS_ACCEPTED,
            reasonCode: 'therapist_accepted',
            attributes: [
                'accepted_at' => now(),
                'confirmed_at' => now(),
                'request_expires_at' => null,
            ],
        );

        return new BookingResource($booking->load('currentQuote'));
    }

    public function reject(Request $request, Booking $booking, BookingStatusTransitionService $transition): BookingResource
    {
        $this->authorizeTherapist($request, $booking);

        $booking = $transition->transition(
            booking: $booking,
            actor: $request->user(),
            actorRole: 'therapist',
            allowedFromStatuses: [Booking::STATUS_REQUESTED],
            toStatus: Booking::STATUS_REJECTED,
            reasonCode: 'therapist_rejected',
            attributes: [
                'canceled_at' => now(),
                'canceled_by_account_id' => $request->user()->id,
                'cancel_reason_code' => 'therapist_rejected',
                'request_expires_at' => null,
            ],
        );

        return new BookingResource($booking->load('currentQuote'));
    }

    public function moving(Request $request, Booking $booking, BookingStatusTransitionService $transition): BookingResource
    {
        $this->authorizeTherapist($request, $booking);

        $booking = $transition->transition(
            booking: $booking,
            actor: $request->user(),
            actorRole: 'therapist',
            allowedFromStatuses: [Booking::STATUS_ACCEPTED],
            toStatus: Booking::STATUS_MOVING,
            reasonCode: 'therapist_moving',
            attributes: [
                'moving_at' => now(),
            ],
        );

        return new BookingResource($booking->load('currentQuote'));
    }

    public function arrived(Request $request, Booking $booking, BookingStatusTransitionService $transition): BookingResource
    {
        $this->authorizeTherapist($request, $booking);

        $booking = $transition->transition(
            booking: $booking,
            actor: $request->user(),
            actorRole: 'therapist',
            allowedFromStatuses: [Booking::STATUS_MOVING],
            toStatus: Booking::STATUS_ARRIVED,
            reasonCode: 'therapist_arrived',
            attributes: [
                'arrived_at' => now(),
            ],
        );

        return new BookingResource($booking->load('currentQuote'));
    }

    public function start(Request $request, Booking $booking, BookingStatusTransitionService $transition): BookingResource
    {
        $this->authorizeTherapist($request, $booking);

        $booking = $transition->transition(
            booking: $booking,
            actor: $request->user(),
            actorRole: 'therapist',
            allowedFromStatuses: [Booking::STATUS_ARRIVED],
            toStatus: Booking::STATUS_IN_PROGRESS,
            reasonCode: 'therapist_started',
            attributes: [
                'started_at' => now(),
            ],
        );

        return new BookingResource($booking->load('currentQuote'));
    }

    public function complete(Request $request, Booking $booking, BookingStatusTransitionService $transition): BookingResource
    {
        $this->authorizeTherapist($request, $booking);

        $booking = $transition->transition(
            booking: $booking,
            actor: $request->user(),
            actorRole: 'therapist',
            allowedFromStatuses: [Booking::STATUS_IN_PROGRESS],
            toStatus: Booking::STATUS_THERAPIST_COMPLETED,
            reasonCode: 'therapist_completed',
            attributes: [
                'ended_at' => now(),
            ],
        );

        return new BookingResource($booking->load('currentQuote'));
    }

    public function userCompleteConfirmation(Request $request, Booking $booking, BookingStatusTransitionService $transition): BookingResource
    {
        abort_unless($booking->user_account_id === $request->user()->id, 404);

        $booking = $transition->transition(
            booking: $booking,
            actor: $request->user(),
            actorRole: 'user',
            allowedFromStatuses: [Booking::STATUS_THERAPIST_COMPLETED],
            toStatus: Booking::STATUS_COMPLETED,
            reasonCode: 'user_completed',
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

        return new BookingResource($booking->load('currentQuote'));
    }

    private function authorizeTherapist(Request $request, Booking $booking): void
    {
        abort_unless($booking->therapist_account_id === $request->user()->id, 404);
    }
}
