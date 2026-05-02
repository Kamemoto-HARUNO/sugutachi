<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Api\Concerns\RecordsAdminAuditLogs;
use App\Http\Controllers\Controller;
use App\Http\Resources\AdminBannerResource;
use App\Models\Banner;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminBannerController extends Controller
{
    use AuthorizesAdminRequests;
    use RecordsAdminAuditLogs;

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorizeAdmin($request->user());

        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:120'],
            'placement' => ['nullable', Rule::in(Banner::placementOptions())],
            'viewer_segment' => ['nullable', Rule::in(Banner::viewerSegmentOptions())],
            'status' => ['nullable', Rule::in(Banner::statusOptions())],
        ]);

        return AdminBannerResource::collection(
            Banner::query()
                ->with(['createdBy', 'updatedBy'])
                ->when(
                    filled($validated['q'] ?? null),
                    function ($query) use ($validated): void {
                        $term = trim((string) $validated['q']);
                        $query->where(function ($builder) use ($term): void {
                            $builder
                                ->where('title', 'like', "%{$term}%")
                                ->orWhere('public_id', $term);
                        });
                    }
                )
                ->when($validated['placement'] ?? null, fn ($query, string $placement) => $query->whereJsonContains('placements', $placement))
                ->when($validated['viewer_segment'] ?? null, fn ($query, string $viewerSegment) => $query->whereJsonContains('viewer_segments', $viewerSegment))
                ->when($validated['status'] ?? null, fn ($query, string $status) => $query->where('status', $status))
                ->orderBy('sort_order')
                ->orderByDesc('updated_at')
                ->get()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);

        $validated = $this->validatePayload($request, isCreate: true);
        [$startsAt, $endsAt] = $this->resolveWindow($validated);
        $publicId = 'bnr_'.Str::ulid();
        $image = $validated['image'];
        $imagePath = $this->storeImage($image, $publicId);

        $banner = Banner::create([
            'public_id' => $publicId,
            'title' => trim($validated['title']),
            'link_url' => trim($validated['link_url']),
            'image_path' => $imagePath,
            'image_original_name' => $image->getClientOriginalName(),
            'image_mime_type' => $image->getClientMimeType(),
            'image_size_bytes' => $image->getSize(),
            'placements' => $this->normalizeStringArray($validated['placements']),
            'viewer_segments' => $this->normalizeStringArray($validated['viewer_segments']),
            'status' => $validated['status'],
            'sort_order' => (int) $validated['sort_order'],
            'starts_at' => $startsAt,
            'ends_at' => $endsAt,
            'created_by_account_id' => $admin->id,
            'updated_by_account_id' => $admin->id,
        ]);

        $banner->load(['createdBy', 'updatedBy']);
        $this->recordAdminAudit($request, 'banner.create', $banner, [], $this->snapshot($banner));

        return (new AdminBannerResource($banner))
            ->response()
            ->setStatusCode(201);
    }

    public function update(Request $request, Banner $banner): AdminBannerResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);

        $validated = $this->validatePayload($request, isCreate: false);
        [$startsAt, $endsAt] = $this->resolveWindow($validated);
        $before = $this->snapshot($banner);
        $previousImagePath = $banner->image_path;
        $image = $validated['image'] ?? null;

        if ($image instanceof UploadedFile) {
            $banner->image_path = $this->storeImage($image, $banner->public_id);
            $banner->image_original_name = $image->getClientOriginalName();
            $banner->image_mime_type = $image->getClientMimeType();
            $banner->image_size_bytes = $image->getSize();
        }

        $banner->forceFill([
            'title' => trim($validated['title']),
            'link_url' => trim($validated['link_url']),
            'placements' => $this->normalizeStringArray($validated['placements']),
            'viewer_segments' => $this->normalizeStringArray($validated['viewer_segments']),
            'status' => $validated['status'],
            'sort_order' => (int) $validated['sort_order'],
            'starts_at' => $startsAt,
            'ends_at' => $endsAt,
            'updated_by_account_id' => $admin->id,
        ])->save();

        if ($image instanceof UploadedFile && $previousImagePath && $previousImagePath !== $banner->image_path) {
            Storage::disk('public')->delete($previousImagePath);
        }

        $banner->load(['createdBy', 'updatedBy']);
        $this->recordAdminAudit($request, 'banner.update', $banner, $before, $this->snapshot($banner->refresh()));

        return new AdminBannerResource($banner);
    }

    public function destroy(Request $request, Banner $banner): JsonResponse
    {
        $this->authorizeAdmin($request->user());

        $before = $this->snapshot($banner);

        if ($banner->image_path) {
            Storage::disk('public')->delete($banner->image_path);
        }

        $this->recordAdminAudit($request, 'banner.delete', $banner, $before, []);
        $banner->delete();

        return response()->json(null, 204);
    }

    private function validatePayload(Request $request, bool $isCreate): array
    {
        return $request->validate([
            'title' => ['required', 'string', 'max:120'],
            'link_url' => ['required', 'string', 'max:2048', 'url', 'starts_with:http://,https://'],
            'placements' => ['required', 'array', 'min:1'],
            'placements.*' => ['required', Rule::in(Banner::placementOptions())],
            'viewer_segments' => ['required', 'array', 'min:1'],
            'viewer_segments.*' => ['required', Rule::in(Banner::viewerSegmentOptions())],
            'status' => ['required', Rule::in(Banner::statusOptions())],
            'sort_order' => ['required', 'integer', 'min:1', 'max:9999'],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['nullable', 'date'],
            'image' => [
                $isCreate ? 'required' : 'nullable',
                'file',
                'mimes:jpg,jpeg,png,webp',
                'max:10240',
            ],
        ]);
    }

    private function resolveWindow(array $validated): array
    {
        $startsAt = CarbonImmutable::parse($validated['starts_at']);
        $endsAt = filled($validated['ends_at'] ?? null)
            ? CarbonImmutable::parse($validated['ends_at'])
            : null;

        if ($endsAt && $endsAt->lt($startsAt)) {
            throw ValidationException::withMessages([
                'ends_at' => ['終了日時は開始日時以降を指定してください。'],
            ]);
        }

        return [$startsAt, $endsAt];
    }

    private function normalizeStringArray(array $values): array
    {
        return collect($values)
            ->map(fn ($value) => trim((string) $value))
            ->filter()
            ->unique()
            ->values()
            ->all();
    }

    private function storeImage(UploadedFile $image, string $publicId): string
    {
        $extension = strtolower($image->getClientOriginalExtension() ?: $image->extension() ?: 'jpg');

        return $image->storeAs(
            "banners/{$publicId}",
            Str::ulid().'.'.$extension,
            'public',
        );
    }

    private function snapshot(Banner $banner): array
    {
        return [
            'public_id' => $banner->public_id,
            'title' => $banner->title,
            'link_url' => $banner->link_url,
            'image_path' => $banner->image_path,
            'image_original_name' => $banner->image_original_name,
            'image_mime_type' => $banner->image_mime_type,
            'image_size_bytes' => $banner->image_size_bytes,
            'placements' => $banner->placements,
            'viewer_segments' => $banner->viewer_segments,
            'status' => $banner->status,
            'sort_order' => $banner->sort_order,
            'starts_at' => $banner->starts_at,
            'ends_at' => $banner->ends_at,
            'impression_count' => $banner->impression_count,
            'click_count' => $banner->click_count,
            'created_by_account_id' => $banner->created_by_account_id,
            'updated_by_account_id' => $banner->updated_by_account_id,
        ];
    }
}
