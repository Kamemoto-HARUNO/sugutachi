<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PublicTherapistMenuResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'public_id' => data_get($this->resource, 'public_id'),
            'name' => data_get($this->resource, 'name'),
            'description' => data_get($this->resource, 'description'),
            'duration_minutes' => data_get($this->resource, 'duration_minutes'),
            'minimum_duration_minutes' => data_get($this->resource, 'minimum_duration_minutes', data_get($this->resource, 'duration_minutes')),
            'duration_step_minutes' => data_get($this->resource, 'duration_step_minutes', 15),
            'base_price_amount' => data_get($this->resource, 'base_price_amount'),
            'hourly_rate_amount' => data_get(
                $this->resource,
                'hourly_rate_amount',
                $this->resolveHourlyRateAmount(),
            ),
            'estimated_total_amount' => data_get($this->resource, 'estimated_total_amount'),
        ];
    }

    private function resolveHourlyRateAmount(): ?int
    {
        $basePriceAmount = data_get($this->resource, 'base_price_amount');
        $minimumDurationMinutes = data_get($this->resource, 'minimum_duration_minutes', data_get($this->resource, 'duration_minutes'));

        if (! is_numeric($basePriceAmount) || ! is_numeric($minimumDurationMinutes) || (int) $minimumDurationMinutes <= 0) {
            return null;
        }

        return (int) round(((int) $basePriceAmount * 60) / (int) $minimumDurationMinutes);
    }
}
