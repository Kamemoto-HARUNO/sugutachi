<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\TherapistProfileResource;
use App\Models\TherapistProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class TherapistProfileController extends Controller
{
    public function show(Request $request): TherapistProfileResource
    {
        return new TherapistProfileResource(
            $request->user()->therapistProfile()->with('menus')->firstOrFail()
        );
    }

    public function upsert(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'public_name' => ['required', 'string', 'max:80'],
            'bio' => ['nullable', 'string', 'max:2000'],
            'training_status' => ['nullable', 'string', 'max:50'],
        ]);

        $profile = DB::transaction(function () use ($request, $validated): TherapistProfile {
            $account = $request->user();

            $account->roleAssignments()->firstOrCreate(
                ['role' => 'therapist'],
                ['status' => 'active', 'granted_at' => now()],
            );
            $account->forceFill(['last_active_role' => 'therapist'])->save();

            return TherapistProfile::updateOrCreate(
                ['account_id' => $account->id],
                [
                    'public_id' => $account->therapistProfile?->public_id ?? 'thp_'.Str::ulid(),
                    'public_name' => $validated['public_name'],
                    'bio' => $validated['bio'] ?? null,
                    'profile_status' => 'approved',
                    'training_status' => $validated['training_status'] ?? 'none',
                    'photo_review_status' => 'approved',
                ],
            );
        });

        return (new TherapistProfileResource($profile->load('menus')))
            ->response()
            ->setStatusCode(200);
    }

    public function updateLocation(Request $request): TherapistProfileResource
    {
        $validated = $request->validate([
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lng' => ['required', 'numeric', 'between:-180,180'],
            'accuracy_m' => ['nullable', 'integer', 'min:0', 'max:10000'],
            'source' => ['nullable', 'string', 'max:50'],
        ]);

        $profile = $request->user()->therapistProfile()->firstOrFail();

        $profile->location()->updateOrCreate(
            ['therapist_profile_id' => $profile->id],
            [
                'lat' => $validated['lat'],
                'lng' => $validated['lng'],
                'accuracy_m' => $validated['accuracy_m'] ?? null,
                'source' => $validated['source'] ?? 'browser',
                'is_searchable' => true,
            ],
        );

        $profile->forceFill([
            'is_online' => true,
            'online_since' => $profile->online_since ?? now(),
            'last_location_updated_at' => now(),
        ])->save();

        return new TherapistProfileResource($profile->refresh()->load('menus'));
    }
}
