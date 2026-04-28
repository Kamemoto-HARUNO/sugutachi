<?php

namespace App\Http\Resources;

use App\Models\TherapistBookingSetting;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TherapistBookingSettingResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        if (! $this->resource instanceof TherapistBookingSetting) {
            return [
                'booking_request_lead_time_minutes' => 60,
                'travel_mode' => TherapistBookingSetting::TRAVEL_MODE_WALKING,
                'max_travel_minutes' => 120,
                'has_scheduled_base_location' => false,
                'can_publish_scheduled_bookings' => false,
                'scheduled_base_location' => null,
            ];
        }

        return [
            'booking_request_lead_time_minutes' => $this->booking_request_lead_time_minutes,
            'travel_mode' => $this->travel_mode ?: TherapistBookingSetting::TRAVEL_MODE_WALKING,
            'max_travel_minutes' => $this->max_travel_minutes ?: 120,
            'has_scheduled_base_location' => filled($this->scheduled_base_lat) && filled($this->scheduled_base_lng),
            'can_publish_scheduled_bookings' => filled($this->scheduled_base_lat) && filled($this->scheduled_base_lng),
            'scheduled_base_location' => [
                'label' => $this->scheduled_base_label,
                'lat' => $this->scheduled_base_lat !== null ? (float) $this->scheduled_base_lat : null,
                'lng' => $this->scheduled_base_lng !== null ? (float) $this->scheduled_base_lng : null,
                'accuracy_m' => $this->scheduled_base_accuracy_m,
            ],
        ];
    }
}
