<?php

namespace App\Services\Bookings;

use App\Models\Booking;
use Carbon\CarbonInterface;

class BookingCancellationPolicy
{
    public function preview(Booking $booking, string $actorRole, ?CarbonInterface $now = null): array
    {
        $now ??= now();

        $totalAmount = (int) $booking->total_amount;
        $matchingFeeAmount = (int) $booking->matching_fee_amount;
        $serviceAmount = max(0, $totalAmount - $matchingFeeAmount);

        if ($actorRole === 'therapist') {
            return $this->result(
                cancelFeeAmount: 0,
                totalAmount: $totalAmount,
                policyCode: 'therapist_cancel_full_refund',
                policyLabel: 'タチキャスト都合キャンセル',
            );
        }

        if (in_array($booking->status, [Booking::STATUS_PAYMENT_AUTHORIZING, Booking::STATUS_REQUESTED], true)) {
            return $this->result(
                cancelFeeAmount: 0,
                totalAmount: $totalAmount,
                policyCode: 'before_acceptance_free',
                policyLabel: '承諾前キャンセル',
            );
        }

        $scheduledStartAt = $booking->scheduled_start_at;

        if (! $scheduledStartAt || $scheduledStartAt->copy()->subHours(3)->lessThanOrEqualTo($now)) {
            return $this->result(
                cancelFeeAmount: $totalAmount,
                totalAmount: $totalAmount,
                policyCode: 'within_3_hours_full',
                policyLabel: '3時間前以降キャンセル',
            );
        }

        if ($scheduledStartAt->copy()->subHours(24)->lessThanOrEqualTo($now)) {
            return $this->result(
                cancelFeeAmount: min($totalAmount, (int) round($serviceAmount * 0.5) + $matchingFeeAmount),
                totalAmount: $totalAmount,
                policyCode: 'within_24_hours_half',
                policyLabel: '24時間前以降キャンセル',
            );
        }

        return $this->result(
            cancelFeeAmount: min($totalAmount, $matchingFeeAmount),
            totalAmount: $totalAmount,
            policyCode: 'accepted_before_24_hours_matching_fee',
            policyLabel: '24時間前までのキャンセル',
        );
    }

    private function result(int $cancelFeeAmount, int $totalAmount, string $policyCode, string $policyLabel): array
    {
        $refundAmount = max(0, $totalAmount - $cancelFeeAmount);

        return [
            'cancel_fee_amount' => $cancelFeeAmount,
            'refund_amount' => $refundAmount,
            'policy_code' => $policyCode,
            'policy_label' => $policyLabel,
            'payment_action' => match (true) {
                $cancelFeeAmount === 0 => 'void_authorization',
                $refundAmount === 0 => 'capture_full_amount',
                default => 'capture_cancel_fee_and_refund_remaining',
            },
        ];
    }
}
