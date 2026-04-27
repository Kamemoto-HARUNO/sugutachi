<?php

namespace App\Services\Bookings;

use App\Models\Booking;
use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;

class BookingSettlementService
{
    public function __construct(
        private readonly BookingSettlementCalculator $calculator,
    ) {
    }

    public function buildCompletionAttributes(
        Booking $booking,
        CarbonImmutable $startedAt,
        CarbonImmutable $endedAt,
        CarbonImmutable $reportedAt,
    ): array {
        return [
            ...$this->buildSettlementAttributes(
                booking: $booking,
                startedAt: $startedAt,
                endedAt: $endedAt,
                upperBound: $reportedAt,
            ),
            'service_completion_reported_at' => $booking->service_completion_reported_at ?? $reportedAt,
        ];
    }

    public function updateTherapistCompletedWindow(
        Booking $booking,
        CarbonImmutable $startedAt,
        CarbonImmutable $endedAt,
    ): Booking {
        $reportedAt = $booking->service_completion_reported_at
            ? CarbonImmutable::instance($booking->service_completion_reported_at)
            : ($booking->ended_at ? CarbonImmutable::instance($booking->ended_at) : CarbonImmutable::now());

        $booking->forceFill(
            $this->buildSettlementAttributes(
                booking: $booking,
                startedAt: $startedAt,
                endedAt: $endedAt,
                upperBound: $reportedAt,
            ),
        )->save();

        return $booking->refresh();
    }

    private function buildSettlementAttributes(
        Booking $booking,
        CarbonImmutable $startedAt,
        CarbonImmutable $endedAt,
        CarbonImmutable $upperBound,
    ): array {
        $arrivedAt = $booking->arrived_at ? CarbonImmutable::instance($booking->arrived_at) : null;

        if ($arrivedAt && $startedAt->lt($arrivedAt)) {
            throw ValidationException::withMessages([
                'started_at' => ['開始時刻は到着時刻より前に設定できません。'],
            ]);
        }

        if ($endedAt->gt($upperBound) || $endedAt->gt(CarbonImmutable::now())) {
            throw ValidationException::withMessages([
                'ended_at' => ['終了時刻は施術終了を記録した時刻より後、または現在時刻より未来には設定できません。'],
            ]);
        }

        if ($endedAt->lte($startedAt)) {
            throw ValidationException::withMessages([
                'ended_at' => ['終了時刻は開始時刻より後に設定してください。'],
            ]);
        }

        $roundedDurationMinutes = $this->calculator->roundedDurationMinutes($startedAt, $endedAt);

        if ($roundedDurationMinutes <= 0) {
            throw ValidationException::withMessages([
                'ended_at' => ['施術時間を計算できませんでした。開始時刻と終了時刻を確認してください。'],
            ]);
        }

        $maximumDurationMinutes = $this->calculator->authorizationDurationMinutes((int) $booking->duration_minutes);

        if ($roundedDurationMinutes > $maximumDurationMinutes) {
            throw ValidationException::withMessages([
                'ended_at' => ['延長は最大60分までです。開始時刻と終了時刻を見直してください。'],
            ]);
        }

        $amounts = $this->calculator->calculateForBooking($booking, $roundedDurationMinutes);

        return [
            'started_at' => $startedAt,
            'ended_at' => $endedAt,
            'actual_duration_minutes' => $roundedDurationMinutes,
            'total_amount' => $amounts['total_amount'],
            'therapist_net_amount' => $amounts['therapist_net_amount'],
            'platform_fee_amount' => $amounts['platform_fee_amount'],
            'matching_fee_amount' => $amounts['matching_fee_amount'],
        ];
    }
}
