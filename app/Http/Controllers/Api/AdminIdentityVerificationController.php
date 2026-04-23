<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\IdentityVerificationResource;
use App\Models\Account;
use App\Models\AdminAuditLog;
use App\Models\IdentityVerification;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class AdminIdentityVerificationController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorizeAdmin($request->user());

        $validated = $request->validate([
            'status' => ['nullable', Rule::in([
                IdentityVerification::STATUS_PENDING,
                IdentityVerification::STATUS_APPROVED,
                IdentityVerification::STATUS_REJECTED,
            ])],
        ]);

        return IdentityVerificationResource::collection(
            IdentityVerification::query()
                ->with(['account', 'reviewedBy'])
                ->when($validated['status'] ?? null, fn ($query, string $status) => $query->where('status', $status))
                ->latest('submitted_at')
                ->get()
        );
    }

    public function approve(Request $request, IdentityVerification $identityVerification): IdentityVerificationResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        abort_unless($identityVerification->status === IdentityVerification::STATUS_PENDING, 409, 'Only pending verifications can be approved.');
        abort_unless($identityVerification->self_declared_male, 409, 'Self declared male confirmation is required.');

        $before = $this->snapshot($identityVerification);

        $identityVerification->forceFill([
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'reviewed_by_account_id' => $admin->id,
            'reviewed_at' => now(),
            'rejection_reason_code' => null,
            'purge_after' => now()->addDays(30),
        ])->save();

        $this->audit($request, 'identity_verification.approve', $identityVerification, $before, $this->snapshot($identityVerification->refresh()));

        return new IdentityVerificationResource($identityVerification->load(['account', 'reviewedBy']));
    }

    public function reject(Request $request, IdentityVerification $identityVerification): IdentityVerificationResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        abort_unless($identityVerification->status === IdentityVerification::STATUS_PENDING, 409, 'Only pending verifications can be rejected.');

        $validated = $request->validate([
            'rejection_reason_code' => ['required', 'string', 'max:100'],
        ]);
        $before = $this->snapshot($identityVerification);

        $identityVerification->forceFill([
            'status' => IdentityVerification::STATUS_REJECTED,
            'is_age_verified' => false,
            'reviewed_by_account_id' => $admin->id,
            'reviewed_at' => now(),
            'rejection_reason_code' => $validated['rejection_reason_code'],
            'purge_after' => now()->addDays(30),
        ])->save();

        $this->audit($request, 'identity_verification.reject', $identityVerification, $before, $this->snapshot($identityVerification->refresh()));

        return new IdentityVerificationResource($identityVerification->load(['account', 'reviewedBy']));
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

    private function audit(Request $request, string $action, IdentityVerification $identityVerification, array $before, array $after): void
    {
        AdminAuditLog::create([
            'actor_account_id' => $request->user()->id,
            'action' => $action,
            'target_type' => IdentityVerification::class,
            'target_id' => $identityVerification->id,
            'ip_hash' => $request->ip() ? hash('sha256', $request->ip()) : null,
            'user_agent_hash' => $request->userAgent() ? hash('sha256', $request->userAgent()) : null,
            'before_json' => $before,
            'after_json' => $after,
            'created_at' => now(),
        ]);
    }

    private function snapshot(IdentityVerification $identityVerification): array
    {
        return $identityVerification->only([
            'id',
            'account_id',
            'provider',
            'status',
            'birth_year',
            'is_age_verified',
            'self_declared_male',
            'document_type',
            'submitted_at',
            'reviewed_by_account_id',
            'reviewed_at',
            'rejection_reason_code',
            'purge_after',
        ]);
    }
}
