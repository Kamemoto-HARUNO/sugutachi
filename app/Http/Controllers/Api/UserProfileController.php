<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserProfileResource;
use App\Models\UserProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class UserProfileController extends Controller
{
    private const AGE_RANGES = ['18_24', '20s', '30s', '40s', '50s', '60_plus'];

    private const BODY_TYPES = ['slim', 'average', 'muscular', 'chubby', 'large', 'other'];

    private const WEIGHT_RANGES = ['40_49', '50_59', '60_69', '70_79', '80_89', '90_plus'];

    private const SEXUAL_ORIENTATIONS = ['gay', 'bi', 'straight', 'other', 'no_answer'];

    private const GENDER_IDENTITIES = ['cis_male', 'trans_male', 'other', 'no_answer'];

    public function show(Request $request): JsonResponse
    {
        $profile = $request->user()->userProfile()->first();

        return response()->json([
            'data' => $profile ? (new UserProfileResource($profile))->resolve($request) : null,
        ]);
    }

    public function upsert(Request $request): JsonResponse
    {
        $validated = $request->validate($this->rules(includeDisclosure: true));
        $account = $request->user();

        $profile = DB::transaction(function () use ($account, $validated): UserProfile {
            $existingProfile = $account->userProfile()->first();
            $merged = $this->mergedAttributes($existingProfile, $validated);

            $account->roleAssignments()->firstOrCreate(
                ['role' => 'user'],
                ['status' => 'active', 'granted_at' => now()],
            );
            $account->forceFill(['last_active_role' => 'user'])->save();

            return UserProfile::updateOrCreate(
                ['account_id' => $account->id],
                [
                    'profile_status' => $this->profileStatus($merged),
                    'age_range' => $merged['age_range'],
                    'body_type' => $merged['body_type'],
                    'height_cm' => $merged['height_cm'],
                    'weight_range' => $merged['weight_range'],
                    'preferences_json' => $merged['preferences'],
                    'touch_ng_json' => $merged['touch_ng'],
                    'health_notes_encrypted' => filled($merged['health_notes'])
                        ? Crypt::encryptString($merged['health_notes'])
                        : null,
                    'sexual_orientation' => $merged['sexual_orientation'],
                    'gender_identity' => $merged['gender_identity'],
                    'disclose_sensitive_profile_to_therapist' => $merged['disclose_sensitive_profile_to_therapist'],
                ],
            );
        });

        return (new UserProfileResource($profile))
            ->response()
            ->setStatusCode(200);
    }

    public function updateSensitiveDisclosure(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'disclose_sensitive_profile_to_therapist' => ['required', 'boolean'],
        ]);

        $account = $request->user();

        $profile = DB::transaction(function () use ($account, $validated): UserProfile {
            $account->roleAssignments()->firstOrCreate(
                ['role' => 'user'],
                ['status' => 'active', 'granted_at' => now()],
            );
            $account->forceFill(['last_active_role' => 'user'])->save();

            $profile = $account->userProfile()->first() ?? new UserProfile([
                'account_id' => $account->id,
                'profile_status' => UserProfile::STATUS_INCOMPLETE,
            ]);

            $profile->forceFill([
                'disclose_sensitive_profile_to_therapist' => $validated['disclose_sensitive_profile_to_therapist'],
            ])->save();

            return $profile->refresh();
        });

        return (new UserProfileResource($profile))
            ->response()
            ->setStatusCode(200);
    }

    private function rules(bool $includeDisclosure): array
    {
        $rules = [
            'age_range' => ['sometimes', 'nullable', Rule::in(self::AGE_RANGES)],
            'body_type' => ['sometimes', 'nullable', Rule::in(self::BODY_TYPES)],
            'height_cm' => ['sometimes', 'nullable', 'integer', 'min:100', 'max:250'],
            'weight_range' => ['sometimes', 'nullable', Rule::in(self::WEIGHT_RANGES)],
            'preferences' => ['sometimes', 'nullable', 'array'],
            'preferences.*' => ['nullable', 'string', 'max:100'],
            'touch_ng' => ['sometimes', 'nullable', 'array'],
            'touch_ng.*' => ['nullable', 'string', 'max:50'],
            'health_notes' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'sexual_orientation' => ['sometimes', 'nullable', Rule::in(self::SEXUAL_ORIENTATIONS)],
            'gender_identity' => ['sometimes', 'nullable', Rule::in(self::GENDER_IDENTITIES)],
        ];

        if ($includeDisclosure) {
            $rules['disclose_sensitive_profile_to_therapist'] = ['sometimes', 'boolean'];
        }

        return $rules;
    }

    private function mergedAttributes(?UserProfile $profile, array $validated): array
    {
        return [
            'age_range' => array_key_exists('age_range', $validated)
                ? $validated['age_range']
                : $profile?->age_range,
            'body_type' => array_key_exists('body_type', $validated)
                ? $validated['body_type']
                : $profile?->body_type,
            'height_cm' => array_key_exists('height_cm', $validated)
                ? $validated['height_cm']
                : $profile?->height_cm,
            'weight_range' => array_key_exists('weight_range', $validated)
                ? $validated['weight_range']
                : $profile?->weight_range,
            'preferences' => array_key_exists('preferences', $validated)
                ? $validated['preferences']
                : $profile?->preferences_json,
            'touch_ng' => array_key_exists('touch_ng', $validated)
                ? $validated['touch_ng']
                : $profile?->touch_ng_json,
            'health_notes' => array_key_exists('health_notes', $validated)
                ? $validated['health_notes']
                : ($profile?->health_notes_encrypted
                    ? Crypt::decryptString($profile->health_notes_encrypted)
                    : null),
            'sexual_orientation' => array_key_exists('sexual_orientation', $validated)
                ? $validated['sexual_orientation']
                : $profile?->sexual_orientation,
            'gender_identity' => array_key_exists('gender_identity', $validated)
                ? $validated['gender_identity']
                : $profile?->gender_identity,
            'disclose_sensitive_profile_to_therapist' => array_key_exists('disclose_sensitive_profile_to_therapist', $validated)
                ? (bool) $validated['disclose_sensitive_profile_to_therapist']
                : ($profile?->disclose_sensitive_profile_to_therapist ?? false),
        ];
    }

    private function profileStatus(array $attributes): string
    {
        $requiredFields = [
            $attributes['age_range'] ?? null,
            $attributes['body_type'] ?? null,
            $attributes['height_cm'] ?? null,
            $attributes['weight_range'] ?? null,
        ];

        foreach ($requiredFields as $value) {
            if (blank($value)) {
                return UserProfile::STATUS_INCOMPLETE;
            }
        }

        return UserProfile::STATUS_ACTIVE;
    }
}
