<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\TherapistProfileResource;
use App\Models\IdentityVerification;
use App\Models\TherapistProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class TherapistProfileController extends Controller
{
    public function show(Request $request): TherapistProfileResource
    {
        return new TherapistProfileResource(
            $request->user()->therapistProfile()->with(['menus', 'account.latestIdentityVerification'])->firstOrFail()
        );
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
        ]);

        $profile = DB::transaction(function () use ($request, $validated): TherapistProfile {
            $account = $request->user();
            $currentProfile = $account->therapistProfile()->first();
            $nextStatus = $this->statusAfterProfileUpdate($currentProfile);

            $account->roleAssignments()->firstOrCreate(
                ['role' => 'therapist'],
                ['status' => 'active', 'granted_at' => now()],
            );
            $account->forceFill(['last_active_role' => 'therapist'])->save();

            return TherapistProfile::updateOrCreate(
                ['account_id' => $account->id],
                [
                    'public_id' => $currentProfile?->public_id ?? 'thp_'.Str::ulid(),
                    'public_name' => $validated['public_name'],
                    'bio' => $validated['bio'] ?? null,
                    'height_cm' => $validated['height_cm'] ?? null,
                    'weight_kg' => $validated['weight_kg'] ?? null,
                    'p_size_cm' => $validated['p_size_cm'] ?? null,
                    'profile_status' => $nextStatus,
                    'training_status' => $validated['training_status'] ?? 'none',
                    'photo_review_status' => $currentProfile?->photo_review_status ?? 'pending',
                    'is_online' => false,
                    'online_since' => null,
                    'approved_at' => $nextStatus === TherapistProfile::STATUS_SUSPENDED
                        ? $currentProfile?->approved_at
                        : null,
                    'approved_by_account_id' => $nextStatus === TherapistProfile::STATUS_SUSPENDED
                        ? $currentProfile?->approved_by_account_id
                        : null,
                    'rejected_reason_code' => $this->rejectedReasonAfterProfileUpdate($currentProfile, $nextStatus),
                ],
            );
        });

        return (new TherapistProfileResource($profile->load(['menus', 'account.latestIdentityVerification'])))
            ->response()
            ->setStatusCode(200);
    }

    public function submitReview(Request $request): TherapistProfileResource
    {
        $profile = $request->user()
            ->therapistProfile()
            ->with(['menus', 'account.latestIdentityVerification'])
            ->firstOrFail();

        abort_if(
            $profile->profile_status === TherapistProfile::STATUS_SUSPENDED,
            409,
            'Suspended therapist profiles cannot be submitted for review.'
        );
        abort_if(
            $profile->profile_status === TherapistProfile::STATUS_PENDING,
            409,
            'Therapist profile is already pending review.'
        );
        abort_if(
            $profile->profile_status === TherapistProfile::STATUS_APPROVED,
            409,
            'Therapist profile is already approved.'
        );

        $requirements = $this->reviewRequirements($profile);
        $errors = [];

        foreach ($requirements as $requirement) {
            if (! $requirement['is_satisfied']) {
                $errors[$requirement['key']] = [$requirement['message']];
            }
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        $profile->forceFill([
            'profile_status' => TherapistProfile::STATUS_PENDING,
            'is_online' => false,
            'online_since' => null,
            'approved_at' => null,
            'approved_by_account_id' => null,
            'rejected_reason_code' => null,
        ])->save();

        return new TherapistProfileResource($profile->refresh()->load(['menus', 'account.latestIdentityVerification']));
    }

    public function reviewStatus(Request $request): JsonResponse
    {
        $profile = $request->user()
            ->therapistProfile()
            ->with(['menus', 'account.latestIdentityVerification'])
            ->firstOrFail();

        $requirements = $this->reviewRequirements($profile);

        return response()->json([
            'data' => [
                'profile' => (new TherapistProfileResource($profile))->resolve($request),
                'can_submit' => $this->canSubmitForReview($profile, $requirements),
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
        $profile = $request->user()->therapistProfile()->firstOrFail();

        abort_unless(
            $profile->profile_status === TherapistProfile::STATUS_APPROVED,
            409,
            'Only approved therapist profiles can go online.'
        );
        abort_unless(
            $profile->location()->where('is_searchable', true)->exists(),
            409,
            'A searchable location is required before going online.'
        );

        $profile->forceFill([
            'is_online' => true,
            'online_since' => $profile->online_since ?? now(),
        ])->save();

        return new TherapistProfileResource($profile->refresh()->load(['menus', 'account.latestIdentityVerification']));
    }

    public function goOffline(Request $request): TherapistProfileResource
    {
        $profile = $request->user()->therapistProfile()->firstOrFail();

        $profile->forceFill([
            'is_online' => false,
            'online_since' => null,
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

    private function statusAfterProfileUpdate(?TherapistProfile $profile): string
    {
        return $profile?->profile_status === TherapistProfile::STATUS_SUSPENDED
            ? TherapistProfile::STATUS_SUSPENDED
            : TherapistProfile::STATUS_DRAFT;
    }

    private function rejectedReasonAfterProfileUpdate(?TherapistProfile $profile, string $nextStatus): ?string
    {
        if (! $profile) {
            return null;
        }

        if ($nextStatus === TherapistProfile::STATUS_SUSPENDED) {
            return $profile->rejected_reason_code;
        }

        if ($profile->profile_status === TherapistProfile::STATUS_REJECTED) {
            return $profile->rejected_reason_code;
        }

        return null;
    }

    private function reviewRequirements(TherapistProfile $profile): array
    {
        $activeMenuCount = $profile->menus->where('is_active', true)->count();
        $identityVerificationStatus = $profile->account?->latestIdentityVerification?->status;

        return [
            [
                'key' => 'public_name',
                'label' => '公開名',
                'is_satisfied' => filled($profile->public_name),
                'message' => 'Public name is required.',
            ],
            [
                'key' => 'active_menu',
                'label' => '提供メニュー',
                'is_satisfied' => $activeMenuCount > 0,
                'message' => 'At least one active menu is required before submitting for review.',
            ],
            [
                'key' => 'identity_verification',
                'label' => '本人確認',
                'is_satisfied' => $identityVerificationStatus === IdentityVerification::STATUS_APPROVED,
                'message' => 'Identity verification must be approved before submitting for review.',
            ],
        ];
    }

    private function canSubmitForReview(TherapistProfile $profile, array $requirements): bool
    {
        if (! in_array($profile->profile_status, [TherapistProfile::STATUS_DRAFT, TherapistProfile::STATUS_REJECTED], true)) {
            return false;
        }

        foreach ($requirements as $requirement) {
            if (! $requirement['is_satisfied']) {
                return false;
            }
        }

        return true;
    }
}
