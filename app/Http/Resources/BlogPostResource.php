<?php

namespace App\Http\Resources;

use App\Models\BlogPost;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin BlogPost
 */
class BlogPostResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'public_id' => $this->public_id,
            'title' => $this->title,
            'slug' => $this->slug,
            'url' => $this->publicUrl(),
            'body_html' => $this->when(str_starts_with($request->path(), 'api/admin/blog-posts') || $request->routeIs('blog-posts.show'), $this->body_html),
            'excerpt' => $this->excerpt,
            'status' => $this->status,
            'status_label' => BlogPost::statusLabel($this->status),
            'publication_state' => $this->publicationStateAt(),
            'is_public' => $this->isVisibleToPublic(),
            'published_at' => $this->published_at,
            'cover_image_url' => $this->coverImageUrl(),
            'cover_image_alt' => $this->cover_image_alt,
            'cover_image_original_name' => $this->cover_image_original_name,
            'cover_image_mime_type' => $this->cover_image_mime_type,
            'cover_image_size_bytes' => $this->cover_image_size_bytes,
            'category' => $this->whenLoaded('category', fn () => $this->category ? new BlogCategoryResource($this->category) : null),
            'tags' => BlogTagResource::collection($this->whenLoaded('tags')),
            'meta_title' => $this->meta_title,
            'meta_description' => $this->meta_description,
            'og_title' => $this->og_title,
            'og_description' => $this->og_description,
            'canonical_url' => $this->canonical_url,
            'noindex' => (bool) $this->noindex,
            'view_count' => (int) $this->view_count,
            'search_view_count' => (int) $this->search_view_count,
            'internal_view_count' => (int) $this->internal_view_count,
            'external_view_count' => (int) $this->external_view_count,
            'direct_view_count' => (int) $this->direct_view_count,
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
