<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Api\Concerns\RecordsAdminAuditLogs;
use App\Http\Controllers\Controller;
use App\Http\Resources\BlogCategoryResource;
use App\Http\Resources\BlogPostResource;
use App\Http\Resources\BlogTagResource;
use App\Models\BlogCategory;
use App\Models\BlogPost;
use App\Models\BlogSlugRedirect;
use App\Models\BlogTag;
use App\Services\Blogs\BlogContentSanitizer;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminBlogPostController extends Controller
{
    use AuthorizesAdminRequests;
    use RecordsAdminAuditLogs;

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorizeAdmin($request->user());

        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:120'],
            'status' => ['nullable', Rule::in(BlogPost::statusOptions())],
            'category' => ['nullable', 'string', 'max:120'],
            'tag' => ['nullable', 'string', 'max:120'],
            'published_from' => ['nullable', 'date'],
            'published_to' => ['nullable', 'date'],
        ]);

        return BlogPostResource::collection(
            BlogPost::query()
                ->with(['category', 'tags', 'createdBy', 'updatedBy'])
                ->when(filled($validated['q'] ?? null), function ($query) use ($validated): void {
                    $term = trim((string) $validated['q']);
                    $query->where(function ($builder) use ($term): void {
                        $builder
                            ->where('title', 'like', "%{$term}%")
                            ->orWhere('slug', 'like', "%{$term}%")
                            ->orWhere('public_id', $term);
                    });
                })
                ->when($validated['status'] ?? null, fn ($query, string $status) => $query->where('status', $status))
                ->when($validated['category'] ?? null, fn ($query, string $category) => $query->whereHas('category', fn ($builder) => $builder->where('slug', $category)))
                ->when($validated['tag'] ?? null, fn ($query, string $tag) => $query->whereHas('tags', fn ($builder) => $builder->where('slug', $tag)))
                ->when($validated['published_from'] ?? null, fn ($query, string $from) => $query->where('published_at', '>=', CarbonImmutable::parse($from)->startOfDay()))
                ->when($validated['published_to'] ?? null, fn ($query, string $to) => $query->where('published_at', '<=', CarbonImmutable::parse($to)->endOfDay()))
                ->orderByRaw('published_at IS NULL')
                ->orderByDesc('published_at')
                ->orderByDesc('updated_at')
                ->paginate(20)
        );
    }

    public function meta(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request->user());

        return response()->json([
            'data' => [
                'categories' => BlogCategoryResource::collection(BlogCategory::query()->orderBy('sort_order')->orderBy('name')->get()),
                'tags' => BlogTagResource::collection(BlogTag::query()->orderBy('name')->get()),
            ],
        ]);
    }

    public function show(Request $request, BlogPost $post): BlogPostResource
    {
        $this->authorizeAdmin($request->user());

        return new BlogPostResource($post->load(['category', 'tags', 'createdBy', 'updatedBy']));
    }

    public function store(Request $request, BlogContentSanitizer $sanitizer): JsonResponse
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);

        $validated = $this->validatePayload($request);
        $publicId = 'blog_'.Str::ulid();
        $slug = $this->normalizeSlug($validated['slug']);
        $this->ensureSlugAvailable($slug);
        $bodyHtml = $sanitizer->sanitize($validated['body_html']);
        $coverImage = $validated['cover_image'] ?? null;

        if ($bodyHtml === '') {
            throw ValidationException::withMessages([
                'body_html' => ['本文を入力してください。'],
            ]);
        }

        $post = BlogPost::create([
            'public_id' => $publicId,
            'blog_category_id' => $this->resolveCategoryId($validated['category_name'] ?? null, $validated['category_slug'] ?? null),
            'title' => trim($validated['title']),
            'slug' => $slug,
            'body_html' => $bodyHtml,
            'excerpt' => filled($validated['excerpt'] ?? null) ? trim($validated['excerpt']) : $sanitizer->excerptFromHtml($bodyHtml),
            'status' => $validated['status'],
            'published_at' => $this->resolvePublishedAt($validated),
            'cover_image_alt' => filled($validated['cover_image_alt'] ?? null) ? trim($validated['cover_image_alt']) : null,
            'meta_title' => filled($validated['meta_title'] ?? null) ? trim($validated['meta_title']) : null,
            'meta_description' => filled($validated['meta_description'] ?? null) ? trim($validated['meta_description']) : null,
            'og_title' => filled($validated['og_title'] ?? null) ? trim($validated['og_title']) : null,
            'og_description' => filled($validated['og_description'] ?? null) ? trim($validated['og_description']) : null,
            'canonical_url' => filled($validated['canonical_url'] ?? null) ? trim($validated['canonical_url']) : null,
            'noindex' => (bool) ($validated['noindex'] ?? false),
            'created_by_account_id' => $admin->id,
            'updated_by_account_id' => $admin->id,
        ]);

        if ($coverImage instanceof UploadedFile) {
            $this->assignCoverImage($post, $coverImage);
        }

        $this->syncTags($post, $validated['tags'] ?? []);
        $post->load(['category', 'tags', 'createdBy', 'updatedBy']);
        $this->recordAdminAudit($request, 'blog.create', $post, [], $this->snapshot($post));

        return (new BlogPostResource($post))
            ->response()
            ->setStatusCode(201);
    }

    public function update(Request $request, BlogPost $post, BlogContentSanitizer $sanitizer): BlogPostResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);

        $validated = $this->validatePayload($request);
        $before = $this->snapshot($post->load(['category', 'tags']));
        $previousCoverPath = $post->cover_image_path;
        $nextSlug = $this->normalizeSlug($validated['slug']);
        $bodyHtml = $sanitizer->sanitize($validated['body_html']);

        if ($bodyHtml === '') {
            throw ValidationException::withMessages([
                'body_html' => ['本文を入力してください。'],
            ]);
        }

        $this->ensureSlugAvailable($nextSlug, $post);

        $post->forceFill([
            'blog_category_id' => $this->resolveCategoryId($validated['category_name'] ?? null, $validated['category_slug'] ?? null),
            'title' => trim($validated['title']),
            'slug' => $nextSlug,
            'body_html' => $bodyHtml,
            'excerpt' => filled($validated['excerpt'] ?? null) ? trim($validated['excerpt']) : $sanitizer->excerptFromHtml($bodyHtml),
            'status' => $validated['status'],
            'published_at' => $this->resolvePublishedAt($validated),
            'cover_image_alt' => filled($validated['cover_image_alt'] ?? null) ? trim($validated['cover_image_alt']) : null,
            'meta_title' => filled($validated['meta_title'] ?? null) ? trim($validated['meta_title']) : null,
            'meta_description' => filled($validated['meta_description'] ?? null) ? trim($validated['meta_description']) : null,
            'og_title' => filled($validated['og_title'] ?? null) ? trim($validated['og_title']) : null,
            'og_description' => filled($validated['og_description'] ?? null) ? trim($validated['og_description']) : null,
            'canonical_url' => filled($validated['canonical_url'] ?? null) ? trim($validated['canonical_url']) : null,
            'noindex' => (bool) ($validated['noindex'] ?? false),
            'updated_by_account_id' => $admin->id,
        ])->save();

        if ($post->wasChanged('slug') && $before['slug'] !== $nextSlug) {
            BlogSlugRedirect::updateOrCreate(
                ['old_slug' => $before['slug']],
                ['blog_post_id' => $post->id, 'new_slug' => $nextSlug],
            );
        }

        $coverImage = $validated['cover_image'] ?? null;

        if ($coverImage instanceof UploadedFile) {
            $this->assignCoverImage($post, $coverImage);

            if ($previousCoverPath && $previousCoverPath !== $post->cover_image_path) {
                Storage::disk('public')->delete($previousCoverPath);
            }
        }

        $this->syncTags($post, $validated['tags'] ?? []);
        $post->load(['category', 'tags', 'createdBy', 'updatedBy']);
        $this->recordAdminAudit($request, 'blog.update', $post, $before, $this->snapshot($post->refresh()->load(['category', 'tags'])));

        return new BlogPostResource($post);
    }

    public function destroy(Request $request, BlogPost $post): JsonResponse
    {
        $this->authorizeAdmin($request->user());

        $before = $this->snapshot($post->load(['category', 'tags']));
        $this->recordAdminAudit($request, 'blog.delete', $post, $before, []);
        $post->delete();

        return response()->json(null, 204);
    }

    private function validatePayload(Request $request): array
    {
        return $request->validate([
            'title' => ['required', 'string', 'max:160'],
            'slug' => ['required', 'string', 'max:160', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/'],
            'body_html' => ['required', 'string'],
            'excerpt' => ['nullable', 'string', 'max:220'],
            'status' => ['required', Rule::in(BlogPost::statusOptions())],
            'published_at' => ['nullable', 'date'],
            'category_name' => ['nullable', 'string', 'max:80'],
            'category_slug' => ['nullable', 'string', 'max:100', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/'],
            'tags' => ['nullable', 'array', 'max:5'],
            'tags.*' => ['string', 'max:40'],
            'cover_image' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp', 'max:10240'],
            'cover_image_alt' => ['nullable', 'string', 'max:160'],
            'meta_title' => ['nullable', 'string', 'max:160'],
            'meta_description' => ['nullable', 'string', 'max:220'],
            'og_title' => ['nullable', 'string', 'max:160'],
            'og_description' => ['nullable', 'string', 'max:220'],
            'canonical_url' => ['nullable', 'url', 'max:2048'],
            'noindex' => ['nullable', 'boolean'],
        ]);
    }

    private function resolvePublishedAt(array $validated): ?CarbonImmutable
    {
        if ($validated['status'] === BlogPost::STATUS_DRAFT || $validated['status'] === BlogPost::STATUS_HIDDEN) {
            return filled($validated['published_at'] ?? null) ? CarbonImmutable::parse($validated['published_at']) : null;
        }

        if ($validated['status'] === BlogPost::STATUS_SCHEDULED && blank($validated['published_at'] ?? null)) {
            throw ValidationException::withMessages([
                'published_at' => ['予約公開には公開日時が必要です。'],
            ]);
        }

        return filled($validated['published_at'] ?? null) ? CarbonImmutable::parse($validated['published_at']) : now()->toImmutable();
    }

    private function normalizeSlug(string $slug): string
    {
        return Str::slug($slug);
    }

    private function ensureSlugAvailable(string $slug, ?BlogPost $currentPost = null): void
    {
        $exists = BlogPost::withTrashed()
            ->where('slug', $slug)
            ->when($currentPost, fn ($query) => $query->whereKeyNot($currentPost->id))
            ->exists();

        if ($exists) {
            throw ValidationException::withMessages([
                'slug' => ['このスラッグはすでに使用されています。'],
            ]);
        }
    }

    private function resolveCategoryId(?string $name, ?string $slug): ?int
    {
        $name = trim((string) $name);

        if ($name === '') {
            return null;
        }

        $slug = filled($slug) ? $this->stableSlug($slug, 'category') : $this->stableSlug($name, 'category');

        return BlogCategory::firstOrCreate(
            ['slug' => $slug],
            ['name' => $name],
        )->id;
    }

    private function syncTags(BlogPost $post, array $tags): void
    {
        $tagIds = collect($tags)
            ->map(fn ($tag) => trim((string) $tag))
            ->filter()
            ->unique(fn (string $tag) => mb_strtolower($tag))
            ->map(function (string $tag): int {
                return BlogTag::firstOrCreate(
                    ['slug' => $this->stableSlug($tag, 'tag')],
                    ['name' => $tag],
                )->id;
            })
            ->values()
            ->all();

        $post->tags()->sync($tagIds);
    }

    private function assignCoverImage(BlogPost $post, UploadedFile $image): void
    {
        $extension = strtolower($image->getClientOriginalExtension() ?: $image->extension() ?: 'jpg');
        $path = $image->storeAs("blog/{$post->public_id}/cover", Str::ulid().'.'.$extension, 'public');

        $post->forceFill([
            'cover_image_path' => $path,
            'cover_image_original_name' => $image->getClientOriginalName(),
            'cover_image_mime_type' => $image->getClientMimeType(),
            'cover_image_size_bytes' => $image->getSize(),
        ])->save();
    }

    private function snapshot(BlogPost $post): array
    {
        return [
            'public_id' => $post->public_id,
            'title' => $post->title,
            'slug' => $post->slug,
            'status' => $post->status,
            'published_at' => $post->published_at,
            'category' => $post->category?->slug,
            'tags' => $post->tags->pluck('slug')->values()->all(),
            'cover_image_path' => $post->cover_image_path,
            'meta_title' => $post->meta_title,
            'meta_description' => $post->meta_description,
            'canonical_url' => $post->canonical_url,
            'noindex' => $post->noindex,
        ];
    }

    private function stableSlug(string $value, string $prefix): string
    {
        $slug = Str::slug($value);

        if ($slug !== '') {
            return $slug;
        }

        return $prefix.'-'.substr(sha1($value), 0, 10);
    }
}
