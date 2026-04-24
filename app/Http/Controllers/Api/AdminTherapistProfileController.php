<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Api\Concerns\RecordsAdminAuditLogs;
use App\Http\Controllers\Api\Concerns\ResolvesAdminFilterIds;
use App\Http\Controllers\Controller;
use App\Http\Resources\AdminTherapistProfileResource;
use App\Models\TherapistProfile;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class AdminTherapistProfileController extends Controller
{
    use AuthorizesAdminRequests;
    use RecordsAdminAuditLogs;
    use ResolvesAdminFilterIds;

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorizeAdmin($request->user());

        $validated = $request->validate([
            'account_id' => ['nullable', 'string', 'max:36'],
            'status' => ['nullable', Rule::in([
                TherapistProfile::STATUS_DRAFT,
                TherapistProfile::STATUS_PENDING,
                TherapistProfile::STATUS_APPROVED,
                TherapistProfile::STATUS_REJECTED,
                TherapistProfile::STATUS_SUSPENDED,
            ])],
            'training_status' => ['nullable', 'string', 'max:50'],
            'q' => ['nullable', 'string', 'max:100'],
            'sort' => ['nullable', Rule::in(['created_at', 'approved_at', 'rating_average', 'review_count'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
        ]);
        $accountId = $this->resolveAccountId($validated['account_id'] ?? null);
        $sort = $validated['sort'] ?? 'created_at';
        $direction = $validated['direction'] ?? 'desc';

        return AdminTherapistProfileResource::collection(
            TherapistProfile::query()
                ->with(['account', 'approvedBy', 'menus'])
                ->when($accountId, fn ($query, int $id) => $query->where('account_id', $id))
                ->when($validated['status'] ?? null, fn ($query, string $status) => $query->where('profile_status', $status))
                ->when(
                    $validated['training_status'] ?? null,
                    fn ($query, string $trainingStatus) => $query->where('training_status', $trainingStatus)
                )
                ->when($validated['q'] ?? null, function ($query, string $term): void {
                    $query->where(function ($query) use ($term): void {
                        $query
                            ->where('public_id', $term)
                            ->orWhere('public_name', 'like', "%{$term}%")
                            ->orWhereHas('account', fn ($query) => $query
                                ->where('email', 'like', "%{$term}%")
                                ->orWhere('display_name', 'like', "%{$term}%"));
                    });
                })
                ->orderBy($sort, $direction)
                ->orderBy('id', $direction)
                ->get()
        );
    }

    public function show(Request $request, TherapistProfile $therapistProfile): AdminTherapistProfileResource
    {
        $this->authorizeAdmin($request->user());

        $therapistProfile->load([
            'account.latestIdentityVerification.reviewedBy',
            'approvedBy',
            'menus',
            'location',
            'photos.account',
            'photos.therapistProfile',
            'photos.reviewedBy',
            'stripeConnectedAccount',
        ]);

        $this->recordAdminAudit($request, 'therapist_profile.view', $therapistProfile, [], $this->snapshot($therapistProfile));

        return new AdminTherapistProfileResource($therapistProfile);
    }

    public function approve(Request $request, TherapistProfile $therapistProfile): AdminTherapistProfileResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        abort_unless($therapistProfile->profile_status === TherapistProfile::STATUS_PENDING, 409, 'Only pending therapist profiles can be approved.');

        $before = $this->snapshot($therapistProfile);

        $therapistProfile->forceFill([
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'approved_by_account_id' => $admin->id,
            'approved_at' => now(),
            'rejected_reason_code' => null,
        ])->save();

        $this->recordAdminAudit($request, 'therapist_profile.approve', $therapistProfile, $before, $this->snapshot($therapistProfile->refresh()));

        return new AdminTherapistProfileResource($therapistProfile->load(['account', 'approvedBy', 'menus']));
    }

    public function reject(Request $request, TherapistProfile $therapistProfile): AdminTherapistProfileResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        abort_unless($therapistProfile->profile_status === TherapistProfile::STATUS_PENDING, 409, 'Only pending therapist profiles can be rejected.');

        $validated = $request->validate([
            'rejected_reason_code' => ['required', 'string', 'max:100'],
        ]);
        $before = $this->snapshot($therapistProfile);

        $therapistProfile->forceFill([
            'profile_status' => TherapistProfile::STATUS_REJECTED,
            'is_online' => false,
            'approved_by_account_id' => null,
            'approved_at' => null,
            'rejected_reason_code' => $validated['rejected_reason_code'],
        ])->save();

        $this->recordAdminAudit($request, 'therapist_profile.reject', $therapistProfile, $before, $this->snapshot($therapistProfile->refresh()));

        return new AdminTherapistProfileResource($therapistProfile->load(['account', 'approvedBy', 'menus']));
    }

    public function suspend(Request $request, TherapistProfile $therapistProfile): AdminTherapistProfileResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        abort_unless($therapistProfile->profile_status === TherapistProfile::STATUS_APPROVED, 409, 'Only approved therapist profiles can be suspended.');

        $validated = $request->validate([
            'rejected_reason_code' => ['nullable', 'string', 'max:100'],
        ]);
        $before = $this->snapshot($therapistProfile);

        $therapistProfile->forceFill([
            'profile_status' => TherapistProfile::STATUS_SUSPENDED,
            'is_online' => false,
            'rejected_reason_code' => $validated['rejected_reason_code'] ?? 'admin_suspended',
        ])->save();

        $this->recordAdminAudit($request, 'therapist_profile.suspend', $therapistProfile, $before, $this->snapshot($therapistProfile->refresh()));

        return new AdminTherapistProfileResource($therapistProfile->load(['account', 'approvedBy', 'menus']));
    }

    public function restore(Request $request, TherapistProfile $therapistProfile): AdminTherapistProfileResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        abort_unless($therapistProfile->profile_status === TherapistProfile::STATUS_SUSPENDED, 409, 'Only suspended therapist profiles can be restored.');

        $before = $this->snapshot($therapistProfile);

        $therapistProfile->forceFill([
            'profile_status' => TherapistProfile::STATUS_DRAFT,
            'is_online' => false,
            'online_since' => null,
            'approved_at' => null,
            'approved_by_account_id' => null,
        ])->save();

        $this->recordAdminAudit($request, 'therapist_profile.restore', $therapistProfile, $before, $this->snapshot($therapistProfile->refresh()));

        return new AdminTherapistProfileResource($therapistProfile->load(['account', 'approvedBy', 'menus']));
    }

    private function snapshot(TherapistProfile $therapistProfile): array
    {
        return $therapistProfile->only([
            'id',
            'public_id',
            'account_id',
            'public_name',
            'profile_status',
            'training_status',
            'photo_review_status',
            'is_online',
            'approved_at',
            'approved_by_account_id',
            'rejected_reason_code',
        ]);
    }
}
