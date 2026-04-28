<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\TherapistMenuResource;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use App\Services\Therapists\TherapistProfilePublicationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class TherapistMenuController extends Controller
{
    public function __construct(
        private readonly TherapistProfilePublicationService $publicationService,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $profile = $request->user()->ensureTherapistProfile();

        return TherapistMenuResource::collection(
            $profile->menus()->orderBy('sort_order')->get()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:1000'],
            'duration_minutes' => ['nullable', 'integer', 'min:30', 'max:240'],
            'minimum_duration_minutes' => ['nullable', 'integer', 'min:30', 'max:240'],
            'base_price_amount' => ['nullable', 'integer', 'min:1000', 'max:300000'],
            'hourly_rate_amount' => ['nullable', 'integer', 'min:1000', 'max:300000'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:1000'],
        ]);

        $profile = $request->user()->ensureTherapistProfile();
        $pricingAttributes = $this->resolvePricingAttributes($validated);

        $menu = DB::transaction(function () use ($profile, $validated, $pricingAttributes): TherapistMenu {
            $menu = TherapistMenu::create([
                'public_id' => 'menu_'.Str::ulid(),
                'therapist_profile_id' => $profile->id,
                'name' => $validated['name'],
                'description' => $validated['description'] ?? null,
                'duration_minutes' => $pricingAttributes['duration_minutes'],
                'base_price_amount' => $pricingAttributes['base_price_amount'],
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
            'duration_minutes' => ['sometimes', 'nullable', 'integer', 'min:30', 'max:240'],
            'minimum_duration_minutes' => ['sometimes', 'nullable', 'integer', 'min:30', 'max:240'],
            'base_price_amount' => ['sometimes', 'nullable', 'integer', 'min:1000', 'max:300000'],
            'hourly_rate_amount' => ['sometimes', 'nullable', 'integer', 'min:1000', 'max:300000'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:1000'],
        ]);

        $profile = $request->user()->ensureTherapistProfile();
        abort_unless($therapistMenu->therapist_profile_id === $profile->id, 404);
        $pricingAttributes = $this->resolvePricingAttributes($validated, $therapistMenu);

        $menu = DB::transaction(function () use ($therapistMenu, $validated, $profile, $pricingAttributes): TherapistMenu {
            $nextAttributes = $validated;
            unset($nextAttributes['minimum_duration_minutes'], $nextAttributes['hourly_rate_amount']);

            if ($pricingAttributes !== []) {
                $nextAttributes = [
                    ...$nextAttributes,
                    ...$pricingAttributes,
                ];
            }

            $therapistMenu->fill($nextAttributes);
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
        $profile = $request->user()->ensureTherapistProfile();
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
        $this->publicationService->refreshPublicationState($profile);
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array{duration_minutes:int,base_price_amount:int}|array{}
     */
    private function resolvePricingAttributes(array $validated, ?TherapistMenu $currentMenu = null): array
    {
        $minimumDurationProvided = array_key_exists('minimum_duration_minutes', $validated) || array_key_exists('duration_minutes', $validated);
        $pricingProvided = array_key_exists('hourly_rate_amount', $validated) || array_key_exists('base_price_amount', $validated);

        if (! $minimumDurationProvided && ! $pricingProvided) {
            return [];
        }

        $durationMinutes = $validated['minimum_duration_minutes']
            ?? $validated['duration_minutes']
            ?? $currentMenu?->duration_minutes;

        if (! is_numeric($durationMinutes)) {
            throw ValidationException::withMessages([
                'minimum_duration_minutes' => ['The minimum duration is required.'],
            ]);
        }

        $durationMinutes = (int) $durationMinutes;

        if (array_key_exists('hourly_rate_amount', $validated) && $validated['hourly_rate_amount'] !== null) {
            return [
                'duration_minutes' => $durationMinutes,
                'base_price_amount' => (int) round(((int) $validated['hourly_rate_amount'] * $durationMinutes) / 60),
            ];
        }

        if (array_key_exists('base_price_amount', $validated) && $validated['base_price_amount'] !== null) {
            return [
                'duration_minutes' => $durationMinutes,
                'base_price_amount' => (int) $validated['base_price_amount'],
            ];
        }

        if (! $currentMenu) {
            throw ValidationException::withMessages([
                'hourly_rate_amount' => ['The hourly rate is required when creating a menu.'],
            ]);
        }

        return [
            'duration_minutes' => $durationMinutes,
            'base_price_amount' => (int) round(($currentMenu->hourly_rate_amount * $durationMinutes) / 60),
        ];
    }
}
