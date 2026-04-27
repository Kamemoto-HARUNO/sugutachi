<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;

class PublicTherapistDetailResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'public_id' => data_get($this->resource, 'public_id'),
            'public_name' => data_get($this->resource, 'public_name'),
            'bio' => data_get($this->resource, 'bio'),
            'age' => data_get($this->resource, 'age'),
            'height_cm' => data_get($this->resource, 'height_cm'),
            'weight_kg' => data_get($this->resource, 'weight_kg'),
            'p_size_cm' => data_get($this->resource, 'p_size_cm'),
            'training_status' => data_get($this->resource, 'training_status'),
            'rating_average' => data_get($this->resource, 'rating_average'),
            'review_count' => data_get($this->resource, 'review_count'),
            'therapist_cancellation_count' => data_get($this->resource, 'therapist_cancellation_count'),
            'is_online' => data_get($this->resource, 'is_online'),
            'walking_time_range' => data_get($this->resource, 'walking_time_range'),
            'lowest_estimated_total_amount' => data_get($this->resource, 'lowest_estimated_total_amount'),
            'menus' => PublicTherapistMenuResource::collection(
                Collection::make(data_get($this->resource, 'menus', []))
            ),
            'photos' => PublicProfilePhotoResource::collection(
                Collection::make(data_get($this->resource, 'photos', []))
            ),
        ];
    }
}
