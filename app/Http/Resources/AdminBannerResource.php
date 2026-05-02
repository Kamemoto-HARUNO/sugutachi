<?php

namespace App\Http\Resources;

use App\Models\Banner;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Banner
 */
class AdminBannerResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $publicationState = $this->publicationStateAt();

        return [
            'public_id' => $this->public_id,
            'title' => $this->title,
            'link_url' => $this->link_url,
            'image_url' => $this->imageUrl(),
            'image_original_name' => $this->image_original_name,
            'image_mime_type' => $this->image_mime_type,
            'image_size_bytes' => $this->image_size_bytes,
            'placements' => $this->placements ?? [],
            'placement_labels' => collect($this->placements ?? [])
                ->map(fn (string $placement) => Banner::placementLabel($placement))
                ->values()
                ->all(),
            'viewer_segments' => $this->viewer_segments ?? [],
            'viewer_segment_labels' => collect($this->viewer_segments ?? [])
                ->map(fn (string $viewerSegment) => Banner::viewerSegmentLabel($viewerSegment))
                ->values()
                ->all(),
            'status' => $this->status,
            'status_label' => Banner::statusLabel($this->status),
            'publication_state' => $publicationState,
            'publication_state_label' => Banner::publicationStateLabel($publicationState),
            'is_visible' => $this->isVisibleAt(),
            'sort_order' => (int) $this->sort_order,
            'starts_at' => $this->starts_at,
            'ends_at' => $this->ends_at,
            'impression_count' => (int) $this->impression_count,
            'click_count' => (int) $this->click_count,
            'created_by_account' => $this->whenLoaded('createdBy', fn () => $this->createdBy ? [
                'public_id' => $this->createdBy->public_id,
                'display_name' => $this->createdBy->display_name,
                'email' => $this->createdBy->email,
            ] : null),
            'updated_by_account' => $this->whenLoaded('updatedBy', fn () => $this->updatedBy ? [
                'public_id' => $this->updatedBy->public_id,
                'display_name' => $this->updatedBy->display_name,
                'email' => $this->updatedBy->email,
            ] : null),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
