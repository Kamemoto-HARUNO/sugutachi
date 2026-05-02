<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PublicBannerResource;
use App\Models\Account;
use App\Models\Banner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class BannerController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $placement = $this->validatePlacement($request);

        return PublicBannerResource::collection(
            $this->visibleBannerQuery($placement, [Banner::VIEWER_SEGMENT_GUEST])->get()
        );
    }

    public function indexForAuthenticated(Request $request): AnonymousResourceCollection
    {
        $placement = $this->validatePlacement($request);
        $viewerSegments = $this->viewerSegmentsForAccount($request->user());

        return PublicBannerResource::collection(
            $this->visibleBannerQuery($placement, $viewerSegments)->get()
        );
    }

    public function trackImpression(Banner $banner): JsonResponse
    {
        if ($banner->isVisibleAt()) {
            Banner::query()->whereKey($banner->getKey())->increment('impression_count');
        }

        return response()->json(null, 204);
    }

    public function trackClick(Banner $banner): JsonResponse
    {
        if ($banner->isVisibleAt()) {
            Banner::query()->whereKey($banner->getKey())->increment('click_count');
        }

        return response()->json(null, 204);
    }

    public function showImage(Banner $banner): StreamedResponse
    {
        abort_unless(
            $banner->image_path && Storage::disk('public')->exists($banner->image_path),
            404
        );

        return Storage::disk('public')->response(
            $banner->image_path,
            $banner->image_original_name ?? basename($banner->image_path),
            [
                'Cache-Control' => 'public, max-age=3600',
            ],
        );
    }

    private function validatePlacement(Request $request): string
    {
        return $request->validate([
            'placement' => ['required', Rule::in(Banner::placementOptions())],
        ])['placement'];
    }

    private function visibleBannerQuery(string $placement, array $viewerSegments)
    {
        return Banner::query()
            ->published()
            ->activeAt(now())
            ->forPlacement($placement)
            ->forViewerSegments($viewerSegments)
            ->orderBy('sort_order')
            ->orderBy('id');
    }

    private function viewerSegmentsForAccount(Account $account): array
    {
        $roles = $account->roleAssignments()
            ->where('status', 'active')
            ->whereNull('revoked_at')
            ->pluck('role')
            ->all();

        return collect($roles)
            ->filter(fn ($role) => in_array($role, [Banner::VIEWER_SEGMENT_USER, Banner::VIEWER_SEGMENT_THERAPIST], true))
            ->unique()
            ->values()
            ->all();
    }
}
