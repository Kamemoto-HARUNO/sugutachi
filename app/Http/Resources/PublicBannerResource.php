<?php

namespace App\Http\Resources;

use App\Models\Banner;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Banner
 */
class PublicBannerResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'public_id' => $this->public_id,
            'title' => $this->title,
            'image_url' => $this->imageUrl(),
            'link_url' => $this->link_url,
            'sort_order' => (int) $this->sort_order,
        ];
    }
}
