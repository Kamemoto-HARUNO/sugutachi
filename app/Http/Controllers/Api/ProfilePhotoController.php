<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SelfProfilePhotoResource;
use App\Models\ProfilePhoto;
use App\Models\TempFile;
use App\Models\TherapistProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ProfilePhotoController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'temp_file_id' => ['required', 'string', 'max:64'],
            'usage_type' => ['nullable', Rule::in(['account_profile', 'therapist_profile'])],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:99'],
        ]);

        $account = $request->user();
        $therapistProfile = $account->therapistProfile()->first();
        $usageType = $validated['usage_type']
            ?? ($therapistProfile ? 'therapist_profile' : 'account_profile');

        if ($usageType === 'therapist_profile' && ! $therapistProfile) {
            throw ValidationException::withMessages([
                'usage_type' => 'Therapist profile photos require a therapist profile.',
            ]);
        }

        $tempFile = $this->findUsableTempFile($validated['temp_file_id'], $account->id);
        $sourcePath = Crypt::decryptString($tempFile->storage_key_encrypted);
        $targetPath = $this->profilePhotoPath($account->public_id, $tempFile->original_name);

        Storage::disk('local')->move($sourcePath, $targetPath);

        $photo = DB::transaction(function () use (
            $account,
            $therapistProfile,
            $usageType,
            $validated,
            $tempFile,
            $targetPath,
        ): ProfilePhoto {
            $photo = ProfilePhoto::create([
                'account_id' => $account->id,
                'therapist_profile_id' => $usageType === 'therapist_profile' ? $therapistProfile?->id : null,
                'usage_type' => $usageType,
                'storage_key_encrypted' => Crypt::encryptString($targetPath),
                'content_hash' => hash('sha256', (string) Storage::disk('local')->get($targetPath)),
                'status' => ProfilePhoto::STATUS_APPROVED,
                'sort_order' => $validated['sort_order']
                    ?? $this->nextSortOrder($account->id, $therapistProfile?->id, $usageType),
            ]);

            $tempFile->forceFill([
                'status' => 'used',
                'used_at' => now(),
            ])->save();

            if ($therapistProfile) {
                $this->syncTherapistPhotoReviewStatus($therapistProfile);
            }

            return $photo;
        });

        return (new SelfProfilePhotoResource($photo->load('therapistProfile')))
            ->response()
            ->setStatusCode(201);
    }

    public function destroy(Request $request, ProfilePhoto $profilePhoto): JsonResponse
    {
        abort_unless($profilePhoto->account_id === $request->user()->id, 404);

        $profilePhoto->loadMissing('therapistProfile');

        rescue(function () use ($profilePhoto): void {
            Storage::disk('local')->delete(Crypt::decryptString($profilePhoto->storage_key_encrypted));
        }, report: false);

        DB::transaction(function () use ($profilePhoto): void {
            $therapistProfile = $profilePhoto->therapistProfile;
            $profilePhoto->delete();

            if ($therapistProfile) {
                $this->syncTherapistPhotoReviewStatus($therapistProfile->fresh('photos') ?? $therapistProfile);
            }
        });

        return response()->json(null, 204);
    }

    private function findUsableTempFile(string $fileId, int $accountId): TempFile
    {
        $tempFile = TempFile::query()
            ->where('file_id', $fileId)
            ->where('account_id', $accountId)
            ->where('purpose', 'profile_photo')
            ->where('status', 'uploaded')
            ->where('expires_at', '>', now())
            ->first();

        if (! $tempFile) {
            throw ValidationException::withMessages([
                'temp_file_id' => 'The selected profile photo file is unavailable.',
            ]);
        }

        return $tempFile;
    }

    private function nextSortOrder(int $accountId, ?int $therapistProfileId, string $usageType): int
    {
        return (int) ProfilePhoto::query()
            ->where('account_id', $accountId)
            ->where('usage_type', $usageType)
            ->when(
                $therapistProfileId,
                fn ($query) => $query->where('therapist_profile_id', $therapistProfileId),
                fn ($query) => $query->whereNull('therapist_profile_id'),
            )
            ->max('sort_order') + 1;
    }

    private function profilePhotoPath(string $accountPublicId, ?string $originalName): string
    {
        $extension = Str::lower(pathinfo((string) $originalName, PATHINFO_EXTENSION));
        $extension = $extension !== '' ? $extension : 'jpg';

        return 'profiles/'.$accountPublicId.'/'.Str::ulid().'.'.$extension;
    }

    private function syncTherapistPhotoReviewStatus(TherapistProfile $therapistProfile): void
    {
        $hasPending = $therapistProfile->photos()->where('status', ProfilePhoto::STATUS_PENDING)->exists();
        $hasApproved = $therapistProfile->photos()->where('status', ProfilePhoto::STATUS_APPROVED)->exists();
        $hasRejected = $therapistProfile->photos()->where('status', ProfilePhoto::STATUS_REJECTED)->exists();

        $therapistProfile->forceFill([
            'photo_review_status' => match (true) {
                $hasApproved => ProfilePhoto::STATUS_APPROVED,
                $hasPending => ProfilePhoto::STATUS_PENDING,
                $hasRejected => ProfilePhoto::STATUS_REJECTED,
                default => ProfilePhoto::STATUS_PENDING,
            },
        ])->save();
    }
}
