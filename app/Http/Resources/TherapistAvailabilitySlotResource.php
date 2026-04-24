<?php

namespace App\Http\Resources;

use App\Models\TherapistAvailabilitySlot;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TherapistAvailabilitySlotResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        /** @var TherapistAvailabilitySlot $slot */
        $slot = $this->resource;

        return [
            'public_id' => $slot->public_id,
            'start_at' => $slot->start_at,
            'end_at' => $slot->end_at,
            'status' => $slot->status,
            'dispatch_base_type' => $slot->dispatch_base_type,
            'dispatch_area_label' => $slot->dispatch_area_label,
            'custom_dispatch_base' => $slot->dispatch_base_type === TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_CUSTOM
                ? [
                    'label' => $slot->custom_dispatch_base_label,
                    'lat' => $slot->custom_dispatch_base_lat !== null ? (float) $slot->custom_dispatch_base_lat : null,
                    'lng' => $slot->custom_dispatch_base_lng !== null ? (float) $slot->custom_dispatch_base_lng : null,
                    'accuracy_m' => $slot->custom_dispatch_base_accuracy_m,
                ]
                : null,
            'has_blocking_booking' => (bool) ($slot->blocking_bookings_count ?? 0),
            'blocking_booking_count' => (int) ($slot->blocking_bookings_count ?? 0),
        ];
    }
}
