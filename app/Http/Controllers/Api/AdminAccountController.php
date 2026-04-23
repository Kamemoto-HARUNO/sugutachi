<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Api\Concerns\RecordsAdminAuditLogs;
use App\Http\Controllers\Controller;
use App\Http\Resources\AdminAccountResource;
use App\Models\Account;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class AdminAccountController extends Controller
{
    use AuthorizesAdminRequests;
    use RecordsAdminAuditLogs;

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorizeAdmin($request->user());

        $validated = $request->validate([
            'status' => ['nullable', Rule::in([Account::STATUS_ACTIVE, Account::STATUS_SUSPENDED])],
            'role' => ['nullable', Rule::in(['user', 'therapist', 'admin'])],
            'q' => ['nullable', 'string', 'max:100'],
        ]);

        return AdminAccountResource::collection(
            Account::query()
                ->with(['roleAssignments', 'latestIdentityVerification', 'therapistProfile'])
                ->when($validated['status'] ?? null, fn ($query, string $status) => $query->where('status', $status))
                ->when($validated['role'] ?? null, fn ($query, string $role) => $query->whereHas(
                    'roleAssignments',
                    fn ($query) => $query
                        ->where('role', $role)
                        ->where('status', 'active')
                        ->whereNull('revoked_at')
                ))
                ->when($validated['q'] ?? null, fn ($query, string $term) => $query->where(function ($query) use ($term): void {
                    $query
                        ->where('public_id', $term)
                        ->orWhere('email', 'like', "%{$term}%")
                        ->orWhere('display_name', 'like', "%{$term}%");
                }))
                ->latest()
                ->get()
        );
    }

    public function show(Request $request, Account $account): AdminAccountResource
    {
        $this->authorizeAdmin($request->user());

        return new AdminAccountResource($account->load([
            'roleAssignments',
            'latestIdentityVerification',
            'userProfile',
            'therapistProfile',
        ]));
    }

    public function suspend(Request $request, Account $account): AdminAccountResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        abort_unless($account->id !== $admin->id, 409, 'Admins cannot suspend their own account.');
        abort_unless($account->status !== Account::STATUS_SUSPENDED, 409, 'Account is already suspended.');

        $validated = $request->validate([
            'reason_code' => ['required', 'string', 'max:100'],
        ]);
        $before = $this->snapshot($account);

        $account->forceFill([
            'status' => Account::STATUS_SUSPENDED,
            'suspended_at' => now(),
            'suspension_reason' => $validated['reason_code'],
        ])->save();
        $account->tokens()->delete();

        $this->recordAdminAudit($request, 'account.suspend', $account, $before, $this->snapshot($account->refresh()));

        return new AdminAccountResource($account->load([
            'roleAssignments',
            'latestIdentityVerification',
            'userProfile',
            'therapistProfile',
        ]));
    }

    public function restore(Request $request, Account $account): AdminAccountResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        abort_unless($account->status === Account::STATUS_SUSPENDED, 409, 'Only suspended accounts can be restored.');

        $before = $this->snapshot($account);

        $account->forceFill([
            'status' => Account::STATUS_ACTIVE,
            'suspended_at' => null,
            'suspension_reason' => null,
        ])->save();

        $this->recordAdminAudit($request, 'account.restore', $account, $before, $this->snapshot($account->refresh()));

        return new AdminAccountResource($account->load([
            'roleAssignments',
            'latestIdentityVerification',
            'userProfile',
            'therapistProfile',
        ]));
    }

    private function snapshot(Account $account): array
    {
        return $account->only([
            'id',
            'public_id',
            'email',
            'phone_e164',
            'display_name',
            'status',
            'last_active_role',
            'suspended_at',
            'suspension_reason',
        ]);
    }
}
