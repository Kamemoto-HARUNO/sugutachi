<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\TherapistMenuResource;
use App\Models\TherapistMenu;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
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

        return (new TherapistMenuResource($menu))
            ->response()
            ->setStatusCode(201);
    }
}
