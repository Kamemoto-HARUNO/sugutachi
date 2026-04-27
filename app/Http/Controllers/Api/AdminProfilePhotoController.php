<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Api\Concerns\RecordsAdminAuditLogs;
use App\Http\Controllers\Api\Concerns\ResolvesAdminFilterIds;
use App\Http\Controllers\Controller;
use App\Http\Resources\ProfilePhotoResource;
use App\Models\ProfilePhoto;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class AdminProfilePhotoController extends Controller
{
    use AuthorizesAdminRequests;
    use RecordsAdminAuditLogs;
    use ResolvesAdminFilterIds;

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorizeAdmin($request->user());

        $validated = $request->validate([
            'account_id' => ['nullable', 'string', 'max:36'],
            'therapist_profile_id' => ['nullable', 'string', 'max:36'],
            'status' => ['nullable', Rule::in([
                ProfilePhoto::STATUS_PENDING,
                ProfilePhoto::STATUS_APPROVED,
                ProfilePhoto::STATUS_REJECTED,
            ])],
            'usage_type' => ['nullable', 'string', 'max:50'],
            'sort' => ['nullable', Rule::in(['created_at', 'reviewed_at', 'sort_order'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
        ]);
        $accountId = $this->resolveAccountId($validated['account_id'] ?? null);
        $therapistProfileId = $this->resolveTherapistProfileId($validated['therapist_profile_id'] ?? null);
        $sort = $validated['sort'] ?? 'created_at';
        $direction = $validated['direction'] ?? 'desc';

        return ProfilePhotoResource::collection(
            ProfilePhoto::query()
                ->with(['account', 'therapistProfile', 'reviewedBy'])
                ->when($accountId, fn ($query, int $id) => $query->where('account_id', $id))
                ->when($therapistProfileId, fn ($query, int $id) => $query->where('therapist_profile_id', $id))
                ->when($validated['status'] ?? null, fn ($query, string $status) => $query->where('status', $status))
                ->when(
                    $validated['usage_type'] ?? null,
                    fn ($query, string $usageType) => $query->where('usage_type', $usageType)
                )
                ->orderBy($sort, $direction)
                ->orderBy('id', $direction)
                ->get()
        );
    }

    public function approve(Request $request, ProfilePhoto $profilePhoto): ProfilePhotoResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        abort_unless($profilePhoto->status === ProfilePhoto::STATUS_PENDING, 409, 'Only pending photos can be approved.');

        $before = $this->snapshot($profilePhoto);

        $profilePhoto->forceFill([
            'status' => ProfilePhoto::STATUS_APPROVED,
            'rejection_reason_code' => null,
            'reviewed_by_account_id' => $admin->id,
            'reviewed_at' => now(),
        ])->save();

        if ($profilePhoto->therapistProfile) {
            $profilePhoto->therapistProfile->forceFill([
                'photo_review_status' => ProfilePhoto::STATUS_APPROVED,
            ])->save();
        }

        $this->recordAdminAudit($request, 'profile_photo.approve', $profilePhoto, $before, $this->snapshot($profilePhoto->refresh()));

        return new ProfilePhotoResource($profilePhoto->load(['account', 'therapistProfile', 'reviewedBy']));
    }

    public function reject(Request $request, ProfilePhoto $profilePhoto): ProfilePhotoResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        abort_unless($profilePhoto->status === ProfilePhoto::STATUS_PENDING, 409, 'Only pending photos can be rejected.');

        $validated = $request->validate([
            'rejection_reason_code' => ['required', 'string', 'max:100'],
        ]);
        $before = $this->snapshot($profilePhoto);

        $profilePhoto->forceFill([
            'status' => ProfilePhoto::STATUS_REJECTED,
            'rejection_reason_code' => $validated['rejection_reason_code'],
            'reviewed_by_account_id' => $admin->id,
            'reviewed_at' => now(),
        ])->save();

        if ($profilePhoto->therapistProfile) {
            $profilePhoto->therapistProfile->forceFill([
                'photo_review_status' => ProfilePhoto::STATUS_REJECTED,
            ])->save();
        }

        $this->recordAdminAudit($request, 'profile_photo.reject', $profilePhoto, $before, $this->snapshot($profilePhoto->refresh()));

        return new ProfilePhotoResource($profilePhoto->load(['account', 'therapistProfile', 'reviewedBy']));
    }

    public function destroy(Request $request, ProfilePhoto $profilePhoto)
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);

        $profilePhoto->loadMissing('therapistProfile');
        $before = $this->snapshot($profilePhoto);

        rescue(function () use ($profilePhoto): void {
            Storage::disk('local')->delete(Crypt::decryptString($profilePhoto->storage_key_encrypted));
        }, report: false);

        DB::transaction(function () use ($profilePhoto): void {
            $therapistProfile = $profilePhoto->therapistProfile;
            $profilePhoto->delete();

            if ($therapistProfile) {
                $hasApproved = $therapistProfile->photos()->where('status', ProfilePhoto::STATUS_APPROVED)->exists();
                $hasPending = $therapistProfile->photos()->where('status', ProfilePhoto::STATUS_PENDING)->exists();
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
        });

        $this->recordAdminAudit($request, 'profile_photo.delete', $profilePhoto, $before, null);

        return response()->json(null, 204);
    }

    private function snapshot(ProfilePhoto $profilePhoto): array
    {
        return $profilePhoto->only([
            'id',
            'account_id',
            'therapist_profile_id',
            'usage_type',
            'content_hash',
            'status',
            'rejection_reason_code',
            'sort_order',
            'reviewed_by_account_id',
            'reviewed_at',
        ]);
    }
}
