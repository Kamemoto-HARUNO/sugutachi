<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;

class PublicTherapistSearchResultResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'public_id' => data_get($this->resource, 'public_id'),
            'public_name' => data_get($this->resource, 'public_name'),
            'bio_excerpt' => data_get($this->resource, 'bio_excerpt'),
            'age' => data_get($this->resource, 'age'),
            'height_cm' => data_get($this->resource, 'height_cm'),
            'weight_kg' => data_get($this->resource, 'weight_kg'),
            'p_size_cm' => data_get($this->resource, 'p_size_cm'),
            'training_status' => data_get($this->resource, 'training_status'),
            'rating_average' => data_get($this->resource, 'rating_average'),
            'review_count' => data_get($this->resource, 'review_count'),
            'therapist_cancellation_count' => data_get($this->resource, 'therapist_cancellation_count'),
            'walking_time_range' => data_get($this->resource, 'walking_time_range'),
            'estimated_total_amount' => data_get($this->resource, 'estimated_total_amount'),
            'photos' => PublicProfilePhotoResource::collection(
                Collection::make(data_get($this->resource, 'photos', []))
            ),
        ];
    }
}
