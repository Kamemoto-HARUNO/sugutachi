<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\TherapistMenuResource;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class TherapistMenuController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $profile = $request->user()->therapistProfile()->firstOrFail();

        return TherapistMenuResource::collection(
            $profile->menus()->orderBy('sort_order')->get()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:1000'],
            'duration_minutes' => ['required', 'integer', 'min:30', 'max:240'],
            'base_price_amount' => ['required', 'integer', 'min:1000', 'max:300000'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:1000'],
        ]);

        $profile = $request->user()->therapistProfile()->firstOrFail();

        $menu = DB::transaction(function () use ($profile, $validated): TherapistMenu {
            $menu = TherapistMenu::create([
                'public_id' => 'menu_'.Str::ulid(),
                'therapist_profile_id' => $profile->id,
                'name' => $validated['name'],
                'description' => $validated['description'] ?? null,
                'duration_minutes' => $validated['duration_minutes'],
                'base_price_amount' => $validated['base_price_amount'],
                'is_active' => true,
                'sort_order' => $validated['sort_order'] ?? 0,
            ]);

            $this->syncProfileAfterMenuMutation($profile);

            return $menu;
        });

        return (new TherapistMenuResource($menu))
            ->response()
            ->setStatusCode(201);
    }

    public function update(Request $request, TherapistMenu $therapistMenu): TherapistMenuResource
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'description' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'duration_minutes' => ['sometimes', 'required', 'integer', 'min:30', 'max:240'],
            'base_price_amount' => ['sometimes', 'required', 'integer', 'min:1000', 'max:300000'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:1000'],
        ]);

        $profile = $request->user()->therapistProfile()->firstOrFail();
        abort_unless($therapistMenu->therapist_profile_id === $profile->id, 404);

        $menu = DB::transaction(function () use ($therapistMenu, $validated, $profile): TherapistMenu {
            $therapistMenu->fill($validated);
            $dirtyAttributes = array_keys($therapistMenu->getDirty());

            if ($dirtyAttributes === []) {
                return $therapistMenu->refresh();
            }

            $therapistMenu->save();

            if ($this->requiresReReview($dirtyAttributes)) {
                $this->syncProfileAfterMenuMutation($profile);
            }

            return $therapistMenu->refresh();
        });

        return new TherapistMenuResource($menu);
    }

    public function destroy(Request $request, TherapistMenu $therapistMenu): Response
    {
        $profile = $request->user()->therapistProfile()->firstOrFail();
        abort_unless($therapistMenu->therapist_profile_id === $profile->id, 404);
        abort_if(
            $therapistMenu->bookingQuotes()->exists() || $therapistMenu->bookings()->exists(),
            409,
            'Menus already used in quotes or bookings cannot be deleted.'
        );

        DB::transaction(function () use ($therapistMenu, $profile): void {
            $therapistMenu->pricingRules()->delete();
            $therapistMenu->delete();
            $this->syncProfileAfterMenuMutation($profile);
        });

        return response()->noContent();
    }

    private function requiresReReview(array $dirtyAttributes): bool
    {
        return array_intersect($dirtyAttributes, [
            'name',
            'description',
            'duration_minutes',
            'base_price_amount',
            'is_active',
        ]) !== [];
    }

    private function syncProfileAfterMenuMutation(TherapistProfile $profile): void
    {
        if ($profile->profile_status === TherapistProfile::STATUS_SUSPENDED) {
            $profile->forceFill([
                'is_online' => false,
                'online_since' => null,
            ])->save();

            return;
        }

        $profile->forceFill([
            'profile_status' => TherapistProfile::STATUS_DRAFT,
            'is_online' => false,
            'online_since' => null,
            'approved_at' => null,
            'approved_by_account_id' => null,
        ])->save();
    }
}
