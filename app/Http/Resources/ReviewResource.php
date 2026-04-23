<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ReviewResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'booking_public_id' => $this->whenLoaded('booking', fn () => $this->booking->public_id),
            'reviewer_account_id' => $this->reviewer?->public_id,
            'reviewee_account_id' => $this->reviewee?->public_id,
            'reviewer_role' => $this->reviewer_role,
            'rating_overall' => $this->rating_overall,
            'rating_manners' => $this->rating_manners,
            'rating_skill' => $this->rating_skill,
            'rating_cleanliness' => $this->rating_cleanliness,
            'rating_safety' => $this->rating_safety,
            'public_comment' => $this->public_comment,
            'status' => $this->status,
            'created_at' => $this->created_at,
        ];
    }
}
