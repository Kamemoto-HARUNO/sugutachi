<?php

namespace App\Services\Bookings;

use App\Models\Booking;
use App\Services\Notifications\BookingNotificationService;

class BookingStartReminderService
{
    private const REMINDER_STAGE_PRE_DEPARTURE = 'pre_departure';

    private const REMINDER_STAGE_DEPARTURE = 'departure';

    public function __construct(
        private readonly BookingNotificationService $bookingNotificationService,
    ) {
    }

    public function processDueReminders(): array
    {
        return [
            'prepare' => $this->sendDueReminders(self::REMINDER_STAGE_PRE_DEPARTURE),
            'departure' => $this->sendDueReminders(self::REMINDER_STAGE_DEPARTURE),
        ];
    }

    private function sendDueReminders(string $stage): int
    {
        $now = now();
        $sent = 0;

        $bookings = Booking::query()
            ->with(['currentQuote', 'therapistAccount', 'therapistProfile'])
            ->where('status', Booking::STATUS_ACCEPTED)
            ->whereNotNull('scheduled_start_at')
            ->where('scheduled_start_at', '>', $now)
            ->whereNotNull('confirmed_at')
            ->whereNull($this->sentAtColumn($stage))
            ->get();

        foreach ($bookings as $booking) {
            $travelMinutes = $this->resolveTravelMinutes($booking);
            $reminderAt = $this->resolveReminderAt($booking, $stage, $travelMinutes);

            if ($travelMinutes === null || $reminderAt === null) {
                $booking->forceFill([
                    $this->sentAtColumn($stage) => $now,
                ])->save();

                continue;
            }

            if ($booking->confirmed_at?->gt($reminderAt)) {
                $booking->forceFill([
                    $this->sentAtColumn($stage) => $now,
                ])->save();

                continue;
            }

            if ($reminderAt->isFuture()) {
                continue;
            }

            $this->bookingNotificationService->notifyTherapistStartReminder($booking, $stage, $travelMinutes);

            $booking->forceFill([
                $this->sentAtColumn($stage) => $now,
            ])->save();

            $sent++;
        }

        return $sent;
    }

    private function resolveReminderAt(Booking $booking, string $stage, ?int $travelMinutes): ?\Illuminate\Support\Carbon
    {
        if (! $booking->scheduled_start_at || $travelMinutes === null) {
            return null;
        }

        $leadMinutes = match ($stage) {
            self::REMINDER_STAGE_PRE_DEPARTURE => $travelMinutes + 60,
            self::REMINDER_STAGE_DEPARTURE => $travelMinutes,
            default => null,
        };

        if ($leadMinutes === null) {
            return null;
        }

        return $booking->scheduled_start_at->copy()->subMinutes($leadMinutes);
    }

    private function resolveTravelMinutes(Booking $booking): ?int
    {
        $travelMinutes = data_get($booking->currentQuote?->input_snapshot_json, 'walking_time_minutes');

        if (! is_numeric($travelMinutes)) {
            return null;
        }

        return max(0, (int) $travelMinutes);
    }

    private function sentAtColumn(string $stage): string
    {
        return match ($stage) {
            self::REMINDER_STAGE_PRE_DEPARTURE => 'therapist_pre_departure_reminder_sent_at',
            self::REMINDER_STAGE_DEPARTURE => 'therapist_departure_reminder_sent_at',
            default => throw new \InvalidArgumentException("Unsupported reminder stage [{$stage}]"),
        };
    }
}
