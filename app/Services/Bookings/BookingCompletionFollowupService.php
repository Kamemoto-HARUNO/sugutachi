<?php

namespace App\Services\Bookings;

use App\Models\Booking;
use App\Services\Notifications\BookingNotificationService;

class BookingCompletionFollowupService
{
    public function __construct(
        private readonly BookingCompletionService $bookingCompletionService,
        private readonly BookingNotificationService $bookingNotificationService,
    ) {
    }

    public function processPendingConfirmations(): array
    {
        return [
            'reminded' => $this->sendDueReminders(),
            'auto_completed' => $this->autoCompleteDueBookings(),
        ];
    }

    public function sendDueReminders(): int
    {
        $bookings = Booking::query()
            ->with(['userAccount', 'therapistAccount', 'therapistProfile'])
            ->where('status', Booking::STATUS_THERAPIST_COMPLETED)
            ->whereNotNull('ended_at')
            ->where('ended_at', '<=', now()->subHours(24))
            ->where('ended_at', '>', now()->subHours(72))
            ->whereNull('completion_confirmation_reminder_sent_at')
            ->whereDoesntHave('refunds')
            ->whereDoesntHave('reports', fn ($query) => $query->where('status', 'open'))
            ->whereDoesntHave('disputes', fn ($query) => $query->whereIn('status', ['needs_response', 'under_review']))
            ->get();

        foreach ($bookings as $booking) {
            $this->bookingNotificationService->notifyCompletionReminder($booking);

            $booking->forceFill([
                'completion_confirmation_reminder_sent_at' => now(),
            ])->save();
        }

        return $bookings->count();
    }

    public function autoCompleteDueBookings(): int
    {
        $bookings = Booking::query()
            ->with(['userAccount', 'therapistAccount', 'therapistProfile'])
            ->where('status', Booking::STATUS_THERAPIST_COMPLETED)
            ->whereNotNull('ended_at')
            ->where('ended_at', '<=', now()->subHours(72))
            ->whereDoesntHave('refunds')
            ->whereDoesntHave('reports', fn ($query) => $query->where('status', 'open'))
            ->whereDoesntHave('disputes', fn ($query) => $query->whereIn('status', ['needs_response', 'under_review']))
            ->get();

        foreach ($bookings as $booking) {
            $completedBooking = $this->bookingCompletionService->complete(
                booking: $booking,
                actor: null,
                actorRole: 'system',
                reasonCode: 'system_auto_completed',
            );

            $this->bookingNotificationService->notifyAutoCompleted($completedBooking->loadMissing([
                'userAccount',
                'therapistAccount',
                'therapistProfile',
            ]));
        }

        return $bookings->count();
    }
}
