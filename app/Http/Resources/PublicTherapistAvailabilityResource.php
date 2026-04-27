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
            'available_dates' => collect(data_get($this->resource, 'available_dates', []))
                ->map(fn (array $date): array => [
                    'date' => $date['date'],
                    'earliest_start_at' => $date['earliest_start_at'],
                    'latest_end_at' => $date['latest_end_at'],
                    'window_count' => $date['window_count'],
                    'bookable_window_count' => $date['bookable_window_count'],
                    'is_bookable' => $date['is_bookable'],
                    'unavailable_reason' => $date['unavailable_reason'],
                ])
                ->values()
                ->all(),
            'calendar_dates' => collect(data_get($this->resource, 'calendar_dates', []))
                ->map(fn (array $date): array => [
                    'date' => $date['date'],
                    'earliest_start_at' => $date['earliest_start_at'],
                    'latest_end_at' => $date['latest_end_at'],
                    'walking_time_range' => $date['walking_time_range'],
                    'estimated_total_amount_range' => $date['estimated_total_amount_range'],
                    'window_count' => $date['window_count'],
                    'bookable_window_count' => $date['bookable_window_count'],
                    'is_bookable' => $date['is_bookable'],
                    'unavailable_reason' => $date['unavailable_reason'],
                    'windows' => collect($date['windows'] ?? [])
                        ->map(fn (array $window): array => [
                            'availability_slot_id' => $window['availability_slot_id'],
                            'slot_start_at' => $window['slot_start_at'],
                            'slot_end_at' => $window['slot_end_at'],
                            'start_at' => $window['start_at'],
                            'end_at' => $window['end_at'],
                            'booking_deadline_at' => $window['booking_deadline_at'],
                            'dispatch_area_label' => $window['dispatch_area_label'],
                            'walking_time_range' => $window['walking_time_range'],
                            'is_bookable' => $window['is_bookable'],
                            'unavailable_reason' => $window['unavailable_reason'],
                        ])
                        ->values()
                        ->all(),
                ])
                ->values()
                ->all(),
            'windows' => collect(data_get($this->resource, 'windows', []))
                ->map(fn (array $window): array => [
                    'availability_slot_id' => $window['availability_slot_id'],
                    'slot_start_at' => $window['slot_start_at'],
                    'slot_end_at' => $window['slot_end_at'],
                    'start_at' => $window['start_at'],
                    'end_at' => $window['end_at'],
                    'booking_deadline_at' => $window['booking_deadline_at'],
                    'dispatch_area_label' => $window['dispatch_area_label'],
                    'walking_time_range' => $window['walking_time_range'],
                    'is_bookable' => $window['is_bookable'],
                    'unavailable_reason' => $window['unavailable_reason'],
                ])
                ->values()
                ->all(),
        ];
    }
}
