<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Api\Concerns\RecordsAdminAuditLogs;
use App\Http\Controllers\Controller;
use App\Http\Resources\ProfilePhotoResource;
use App\Models\ProfilePhoto;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class AdminProfilePhotoController extends Controller
{
    use AuthorizesAdminRequests;
    use RecordsAdminAuditLogs;

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorizeAdmin($request->user());

        $validated = $request->validate([
            'status' => ['nullable', Rule::in([
                ProfilePhoto::STATUS_PENDING,
                ProfilePhoto::STATUS_APPROVED,
                ProfilePhoto::STATUS_REJECTED,
            ])],
        ]);

        return ProfilePhotoResource::collection(
            ProfilePhoto::query()
                ->with(['account', 'therapistProfile', 'reviewedBy'])
                ->when($validated['status'] ?? null, fn ($query, string $status) => $query->where('status', $status))
                ->latest()
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
