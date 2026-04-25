<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AccountResource;
use App\Models\Account;
use App\Models\TherapistProfile;
use App\Models\UserProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AccountRoleController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'role' => ['required', Rule::in(['user', 'therapist'])],
        ]);

        $role = $validated['role'];
        $account = $request->user();
        $wasCreated = false;

        $account = DB::transaction(function () use ($account, $role, &$wasCreated): Account {
            $roleAssignment = $account->roleAssignments()->firstOrNew(['role' => $role]);
            $wasCreated = ! $roleAssignment->exists;

            $roleAssignment->forceFill([
                'status' => 'active',
                'granted_at' => $roleAssignment->granted_at ?? now(),
                'revoked_at' => null,
            ])->save();

            if ($role === 'user') {
                $account->userProfile()->firstOrCreate(
                    ['account_id' => $account->id],
                    [
                        'profile_status' => UserProfile::STATUS_INCOMPLETE,
                        'disclose_sensitive_profile_to_therapist' => false,
                    ],
                );
            }

            if ($role === 'therapist') {
                $account->therapistProfile()->firstOrCreate(
                    ['account_id' => $account->id],
                    [
                        'public_id' => 'thp_'.Str::ulid(),
                        'public_name' => $this->draftTherapistPublicName($account),
                        'profile_status' => TherapistProfile::STATUS_DRAFT,
                        'training_status' => 'none',
                        'photo_review_status' => 'pending',
                        'is_online' => false,
                    ],
                );
            }

            $account->forceFill(['last_active_role' => $role])->save();

            return $account->fresh(['roleAssignments', 'latestIdentityVerification']);
        });

        return response()->json([
            'data' => (new AccountResource($account))->resolve($request),
            'meta' => [
                'active_role' => $role,
                'role_added' => $role,
                'was_created' => $wasCreated,
            ],
        ]);
    }

    private function draftTherapistPublicName(Account $account): string
    {
        if (filled($account->display_name)) {
            return Str::limit(trim((string) $account->display_name), 80, '');
        }

        $emailLocalPart = Str::before((string) $account->email, '@');

        if (filled($emailLocalPart)) {
            return Str::limit($emailLocalPart, 80, '');
        }

        return '新規セラピスト';
    }
}
