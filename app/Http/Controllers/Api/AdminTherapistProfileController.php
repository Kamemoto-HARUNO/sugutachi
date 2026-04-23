<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\TherapistProfileResource;
use App\Models\Account;
use App\Models\AdminAuditLog;
use App\Models\TherapistProfile;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class AdminTherapistProfileController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorizeAdmin($request->user());

        $validated = $request->validate([
            'status' => ['nullable', Rule::in([
                TherapistProfile::STATUS_DRAFT,
                TherapistProfile::STATUS_PENDING,
                TherapistProfile::STATUS_APPROVED,
                TherapistProfile::STATUS_REJECTED,
                TherapistProfile::STATUS_SUSPENDED,
            ])],
        ]);

        return TherapistProfileResource::collection(
            TherapistProfile::query()
                ->with(['account', 'approvedBy', 'menus'])
                ->when($validated['status'] ?? null, fn ($query, string $status) => $query->where('profile_status', $status))
                ->latest()
                ->get()
        );
    }

    public function approve(Request $request, TherapistProfile $therapistProfile): TherapistProfileResource
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

        $this->audit($request, 'therapist_profile.approve', $therapistProfile, $before, $this->snapshot($therapistProfile->refresh()));

        return new TherapistProfileResource($therapistProfile->load(['account', 'approvedBy', 'menus']));
    }

    public function reject(Request $request, TherapistProfile $therapistProfile): TherapistProfileResource
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

        $this->audit($request, 'therapist_profile.reject', $therapistProfile, $before, $this->snapshot($therapistProfile->refresh()));

        return new TherapistProfileResource($therapistProfile->load(['account', 'approvedBy', 'menus']));
    }

    public function suspend(Request $request, TherapistProfile $therapistProfile): TherapistProfileResource
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

        $this->audit($request, 'therapist_profile.suspend', $therapistProfile, $before, $this->snapshot($therapistProfile->refresh()));

        return new TherapistProfileResource($therapistProfile->load(['account', 'approvedBy', 'menus']));
    }

    private function authorizeAdmin(Account $account): void
    {
        $isAdmin = $account->roleAssignments()
            ->where('role', 'admin')
            ->where('status', 'active')
            ->whereNull('revoked_at')
            ->exists();

        abort_unless($isAdmin, 403);
    }

    private function audit(Request $request, string $action, TherapistProfile $therapistProfile, array $before, array $after): void
    {
        AdminAuditLog::create([
            'actor_account_id' => $request->user()->id,
            'action' => $action,
            'target_type' => TherapistProfile::class,
            'target_id' => $therapistProfile->id,
            'ip_hash' => $request->ip() ? hash('sha256', $request->ip()) : null,
            'user_agent_hash' => $request->userAgent() ? hash('sha256', $request->userAgent()) : null,
            'before_json' => $before,
            'after_json' => $after,
            'created_at' => now(),
        ]);
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
