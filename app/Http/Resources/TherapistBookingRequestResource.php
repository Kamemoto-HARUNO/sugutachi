<?php

namespace App\Http\Resources;

use App\Models\Booking;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TherapistBookingRequestResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        /** @var Booking $booking */
        $booking = $this->resource;

        $requestExpiresAt = $booking->request_expires_at
            ? CarbonImmutable::instance($booking->request_expires_at)
            : null;
        $remainingSeconds = $requestExpiresAt
            ? max(0, CarbonImmutable::now()->diffInSeconds($requestExpiresAt, false))
            : null;
        $dispatchAreaLabel = data_get($booking->currentQuote, 'input_snapshot_json.dispatch_area_label')
            ?? $booking->availabilitySlot?->dispatch_area_label;

        return [
            'public_id' => $booking->public_id,
            'status' => $booking->status,
            'request_type' => $booking->is_on_demand ? 'on_demand' : 'scheduled',
            'is_on_demand' => $booking->is_on_demand,
            'availability_slot_id' => $booking->availabilitySlot?->public_id,
            'requested_start_at' => $booking->requested_start_at,
            'scheduled_start_at' => $booking->scheduled_start_at,
            'scheduled_end_at' => $booking->scheduled_end_at,
            'duration_minutes' => $booking->duration_minutes,
            'dispatch_area_label' => $dispatchAreaLabel,
            'request_expires_at' => $booking->request_expires_at,
            'request_expires_in_seconds' => $remainingSeconds,
            'request_expires_in_minutes' => $remainingSeconds !== null
                ? (int) ceil($remainingSeconds / 60)
                : null,
            'pending_adjustment_proposal' => $booking->hasPendingTherapistAdjustment()
                ? [
                    'proposed_at' => $booking->therapist_adjustment_proposed_at,
                    'scheduled_start_at' => $booking->therapist_adjustment_start_at,
                    'scheduled_end_at' => $booking->therapist_adjustment_end_at,
                    'duration_minutes' => $booking->therapist_adjustment_duration_minutes,
                    'total_amount' => $booking->therapist_adjustment_total_amount,
                    'therapist_net_amount' => $booking->therapist_adjustment_therapist_net_amount,
                    'platform_fee_amount' => $booking->therapist_adjustment_platform_fee_amount,
                    'matching_fee_amount' => $booking->therapist_adjustment_matching_fee_amount,
                    'buffer_before_minutes' => $booking->therapist_adjustment_buffer_before_minutes,
                    'buffer_after_minutes' => $booking->therapist_adjustment_buffer_after_minutes,
                ]
                : null,
            'menu' => $booking->therapistMenu
                ? [
                    'public_id' => $booking->therapistMenu->public_id,
                    'name' => $booking->therapistMenu->name,
                ]
                : [
                    'public_id' => data_get($booking->therapist_snapshot_json, 'menu_public_id'),
                    'name' => data_get($booking->therapist_snapshot_json, 'menu_name'),
                ],
            'service_location' => $booking->serviceAddress
                ? [
                    'place_type' => $booking->serviceAddress->place_type,
                    'prefecture' => $booking->serviceAddress->prefecture,
                    'city' => $booking->serviceAddress->city,
                ]
                : null,
            'amounts' => [
                'total_amount' => $booking->total_amount,
                'therapist_net_amount' => $booking->therapist_net_amount,
                'platform_fee_amount' => $booking->platform_fee_amount,
                'matching_fee_amount' => $booking->matching_fee_amount,
            ],
            'created_at' => $booking->created_at,
        ];
    }
}
