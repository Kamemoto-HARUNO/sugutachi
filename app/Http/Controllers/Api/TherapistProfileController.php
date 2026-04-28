<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\TherapistProfileResource;
use App\Models\TherapistProfile;
use App\Services\Therapists\TherapistProfilePublicationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class TherapistProfileController extends Controller
{
    public function __construct(
        private readonly TherapistProfilePublicationService $publicationService,
    ) {}

    public function show(Request $request): JsonResponse
    {
        $profile = $this->publicationService->refreshPublicationState(
            $request->user()->ensureTherapistProfile()->load(['menus', 'account.latestIdentityVerification'])
        );

        return (new TherapistProfileResource(
            $profile->load(['menus', 'account.latestIdentityVerification'])
        ))
            ->response()
            ->setStatusCode(200);
    }

    public function upsert(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'public_name' => ['required', 'string', 'max:80'],
            'bio' => ['nullable', 'string', 'max:2000'],
            'height_cm' => ['nullable', 'integer', 'between:100,250'],
            'weight_kg' => ['nullable', 'integer', 'between:30,250'],
            'p_size_cm' => ['nullable', 'integer', 'between:1,50'],
            'training_status' => ['nullable', 'string', 'max:50'],
            'is_listed' => ['nullable', 'boolean'],
        ]);

        $profile = DB::transaction(function () use ($request, $validated): TherapistProfile {
            $account = $request->user();
            $currentProfile = $account->therapistProfile()->first();

            $account->roleAssignments()->firstOrCreate(
                ['role' => 'therapist'],
                ['status' => 'active', 'granted_at' => now()],
            );
            $account->forceFill(['last_active_role' => 'therapist'])->save();

            $profile = TherapistProfile::updateOrCreate(
                ['account_id' => $account->id],
                [
                    'public_id' => $currentProfile?->public_id ?? 'thp_'.Str::ulid(),
                    'public_name' => $validated['public_name'],
                    'bio' => $validated['bio'] ?? null,
                    'height_cm' => $validated['height_cm'] ?? null,
                    'weight_kg' => $validated['weight_kg'] ?? null,
                    'p_size_cm' => $validated['p_size_cm'] ?? null,
                    'profile_status' => $currentProfile?->profile_status ?? TherapistProfile::STATUS_DRAFT,
                    'training_status' => $validated['training_status'] ?? 'none',
                    'photo_review_status' => $currentProfile?->photo_review_status ?? 'pending',
                    'is_listed' => array_key_exists('is_listed', $validated)
                        ? (bool) $validated['is_listed']
                        : ($currentProfile?->is_listed ?? true),
                    'is_online' => $currentProfile?->is_online ?? false,
                    'online_since' => $currentProfile?->online_since,
                    'approved_at' => $currentProfile?->approved_at,
                    'approved_by_account_id' => $currentProfile?->approved_by_account_id,
                    'rejected_reason_code' => $currentProfile?->rejected_reason_code,
                ],
            );

            return $this->publicationService->refreshPublicationState($profile);
        });

        return (new TherapistProfileResource($profile->load(['menus', 'account.latestIdentityVerification'])))
            ->response()
            ->setStatusCode(200);
    }

    public function submitReview(Request $request): TherapistProfileResource
    {
        $profile = $request->user()
            ->ensureTherapistProfile()
            ->load(['menus', 'account.latestIdentityVerification']);

        abort_if(
            $profile->profile_status === TherapistProfile::STATUS_SUSPENDED,
            409,
            '停止中のプロフィールは公開設定を更新できません。'
        );

        $requirements = $this->publicationService->requirements($profile);
        $errors = [];

        foreach ($requirements as $requirement) {
            if (! $requirement['is_satisfied']) {
                $errors[$requirement['key']] = [$requirement['message']];
            }
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        $profile = $this->publicationService->refreshPublicationState($profile);

        return new TherapistProfileResource($profile->load(['menus', 'account.latestIdentityVerification']));
    }

    public function reviewStatus(Request $request): JsonResponse
    {
        $profile = $this->publicationService->refreshPublicationState(
            $request->user()
            ->ensureTherapistProfile()
            ->load(['menus', 'account.latestIdentityVerification'])
        );

        $requirements = $this->publicationService->requirements($profile);

        return response()->json([
            'data' => [
                'profile' => (new TherapistProfileResource($profile))->resolve($request),
                'can_submit' => $this->publicationService->isReadyToPublish($profile),
                'active_menu_count' => $profile->menus->where('is_active', true)->count(),
                'latest_identity_verification_status' => $profile->account?->latestIdentityVerification?->status,
                'requirements' => array_map(
                    fn (array $requirement) => [
                        'key' => $requirement['key'],
                        'label' => $requirement['label'],
                        'is_satisfied' => $requirement['is_satisfied'],
                    ],
                    $requirements
                ),
            ],
        ]);
    }

    public function goOnline(Request $request): TherapistProfileResource
    {
        $profile = $request->user()->ensureTherapistProfile();

        abort_unless(
            $profile->profile_status === TherapistProfile::STATUS_APPROVED,
            409,
            '公開条件を満たしたプロフィールだけオンライン受付を開始できます。'
        );
        abort_unless(
            $profile->location()->where('is_searchable', true)->exists(),
            409,
            'オンライン受付を始めるには検索に使える現在地が必要です。'
        );
        abort_unless(
            $profile->is_listed,
            409,
            'オンライン受付を始める前にプロフィールを公開してください。'
        );

        $profile->forceFill([
            'is_online' => true,
            'online_since' => $profile->online_since ?? now(),
        ])->save();

        return new TherapistProfileResource($profile->refresh()->load(['menus', 'account.latestIdentityVerification']));
    }

    public function goOffline(Request $request): TherapistProfileResource
    {
        $profile = $request->user()->ensureTherapistProfile();

        $profile->forceFill([
            'is_online' => false,
            'online_since' => null,
        ])->save();

        return new TherapistProfileResource($profile->refresh()->load(['menus', 'account.latestIdentityVerification']));
    }

    public function updateListing(Request $request): TherapistProfileResource
    {
        $validated = $request->validate([
            'is_listed' => ['required', 'boolean'],
        ]);

        $profile = $request->user()->ensureTherapistProfile();
        $isListed = (bool) $validated['is_listed'];

        $profile->forceFill([
            'is_listed' => $isListed,
            'is_online' => $isListed ? $profile->is_online : false,
            'online_since' => $isListed ? $profile->online_since : null,
        ])->save();

        return new TherapistProfileResource($profile->refresh()->load(['menus', 'account.latestIdentityVerification']));
    }

    public function updateLocation(Request $request): TherapistProfileResource
    {
        $validated = $request->validate([
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lng' => ['required', 'numeric', 'between:-180,180'],
            'accuracy_m' => ['nullable', 'integer', 'min:0', 'max:10000'],
            'source' => ['nullable', 'string', 'max:50'],
        ]);

        $profile = $request->user()->ensureTherapistProfile();

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
            'is_online' => $profile->profile_status === TherapistProfile::STATUS_APPROVED
                ? $profile->is_online
                : false,
            'online_since' => $profile->profile_status === TherapistProfile::STATUS_APPROVED && $profile->is_online
                ? ($profile->online_since ?? now())
                : null,
            'last_location_updated_at' => now(),
        ])->save();

        return new TherapistProfileResource($profile->refresh()->load(['menus', 'account.latestIdentityVerification']));
    }
}
