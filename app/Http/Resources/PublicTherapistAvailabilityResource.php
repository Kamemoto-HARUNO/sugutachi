<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PublicTherapistAvailabilityResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'date' => data_get($this->resource, 'date'),
            'walking_time_range' => data_get($this->resource, 'walking_time_range'),
            'estimated_total_amount_range' => data_get($this->resource, 'estimated_total_amount_range'),
            'windows' => collect(data_get($this->resource, 'windows', []))
                ->map(fn (array $window): array => [
                    'start_at' => $window['start_at'],
                    'end_at' => $window['end_at'],
                    'booking_deadline_at' => $window['booking_deadline_at'],
                    'dispatch_area_label' => $window['dispatch_area_label'],
                ])
                ->values()
                ->all(),
        ];
    }
}
