<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Controller;
use App\Http\Resources\BlogCategoryResource;
use App\Http\Resources\BlogPostResource;
use App\Http\Resources\BlogTagResource;
use App\Models\BlogCategory;
use App\Models\BlogPost;
use App\Models\BlogSlugRedirect;
use App\Models\BlogTag;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class BlogPostController extends Controller
{
    use AuthorizesAdminRequests;

    public function index(Request $request): AnonymousResourceCollection
    {
        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:120'],
            'category' => ['nullable', 'string', 'max:120'],
            'tag' => ['nullable', 'string', 'max:120'],
        ]);

        return BlogPostResource::collection(
            BlogPost::query()
                ->with(['category', 'tags'])
                ->visibleToPublic()
                ->when(filled($validated['q'] ?? null), function ($query) use ($validated): void {
                    $term = trim((string) $validated['q']);
                    $query->where(function ($builder) use ($term): void {
                        $builder
                            ->where('title', 'like', "%{$term}%")
                            ->orWhere('excerpt', 'like', "%{$term}%");
                    });
                })
                ->when($validated['category'] ?? null, fn ($query, string $category) => $query->whereHas('category', fn ($builder) => $builder->where('slug', $category)))
                ->when($validated['tag'] ?? null, fn ($query, string $tag) => $query->whereHas('tags', fn ($builder) => $builder->where('slug', $tag)))
                ->orderByDesc('published_at')
                ->paginate(12)
        )->additional([
            'meta' => [
                'categories' => BlogCategoryResource::collection(BlogCategory::query()->whereHas('posts', fn ($query) => $query->visibleToPublic())->orderBy('sort_order')->orderBy('name')->get()),
                'tags' => BlogTagResource::collection(BlogTag::query()->whereHas('posts', fn ($query) => $query->visibleToPublic())->orderBy('name')->get()),
            ],
        ]);
    }

    public function latest(Request $request): AnonymousResourceCollection
    {
        $limit = min(max((int) $request->integer('limit', 3), 1), 6);

        return BlogPostResource::collection(
            BlogPost::query()
                ->with(['category', 'tags'])
                ->visibleToPublic()
                ->orderByDesc('published_at')
                ->limit($limit)
                ->get()
        );
    }

    public function show(Request $request, string $slug): BlogPostResource|JsonResponse
    {
        $post = BlogPost::query()
            ->with(['category', 'tags'])
            ->where('slug', $slug)
            ->first();

        if (! $post) {
            $redirect = BlogSlugRedirect::query()->where('old_slug', $slug)->first();

            if ($redirect) {
                return response()->json([
                    'data' => [
                        'redirect_to' => '/blog/'.$redirect->new_slug,
                    ],
                ], 301);
            }

            abort(404);
        }

        if (! $post->isVisibleToPublic()) {
            $account = $request->user('sanctum');

            if (! $account) {
                abort(404);
            }

            $this->authorizeAdmin($account);
        }

        return new BlogPostResource($post);
    }

    public function showCoverImage(BlogPost $post)
    {
        if (! $post->cover_image_path || ! Storage::disk('public')->exists($post->cover_image_path)) {
            abort(404);
        }

        return Storage::disk('public')->response($post->cover_image_path, $post->cover_image_original_name);
    }

    public function trackView(Request $request, BlogPost $post): JsonResponse
    {
        abort_unless($post->isVisibleToPublic(), 404);

        $validated = $request->validate([
            'source' => ['required', Rule::in(['search', 'internal', 'external', 'direct'])],
        ]);

        $sourceColumn = match ($validated['source']) {
            'search' => 'search_view_count',
            'internal' => 'internal_view_count',
            'external' => 'external_view_count',
            'direct' => 'direct_view_count',
        };

        BlogPost::query()
            ->whereKey($post->id)
            ->update([
                'view_count' => DB::raw('view_count + 1'),
                $sourceColumn => DB::raw($sourceColumn.' + 1'),
            ]);

        return response()->json(null, 204);
    }
}
