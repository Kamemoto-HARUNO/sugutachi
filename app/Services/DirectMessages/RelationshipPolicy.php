<?php

namespace App\Services\DirectMessages;

use App\Models\Account;
use App\Models\AccountBlock;
use App\Models\RoleRelationship;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class RelationshipPolicy
{
    // Account rows exist even before the first relationship/block. Every writer
    // locks these in numeric order, but the relationship key remains role ordered.
    public function lock(int $userId, int $therapistId): RoleRelationship
    {
        if (DB::transactionLevel() === 0) {
            throw new \LogicException('Relationship locks require a transaction.');
        }
        Account::query()->whereIn('id', [$userId, $therapistId])->orderBy('id')->lockForUpdate()->get();

        return RoleRelationship::query()->firstOrCreate(
            ['user_account_id' => $userId, 'therapist_account_id' => $therapistId],
            ['public_id' => 'rel_'.Str::ulid()],
        );
    }

    public function blocked(int $userId, int $therapistId): bool
    {
        return RoleRelationship::query()->where('user_account_id', $userId)->where('therapist_account_id', $therapistId)
            ->where(fn ($q) => $q->whereNotNull('user_blocked_at')->orWhereNotNull('therapist_blocked_at'))->exists()
            || AccountBlock::query()->where(fn ($q) => $q
                ->where(fn ($q) => $q->where('blocker_account_id', $userId)->where('blocked_account_id', $therapistId))
                ->orWhere(fn ($q) => $q->where('blocker_account_id', $therapistId)->where('blocked_account_id', $userId)))->exists();
    }

    public function assertAllowed(int $userId, int $therapistId): void
    {
        abort_if($this->blocked($userId, $therapistId), 409, '現在この相手への相談・予約はできません。');
    }

    public function authorizeRole(Account $actor, string $role): void
    {
        abort_unless(in_array($role, ['user', 'therapist'], true), 404);
        abort_unless($actor->status === Account::STATUS_ACTIVE && $actor->roleAssignments()->where('role', $role)->where('status', 'active')->whereNull('revoked_at')->exists(), 403);
    }
}
