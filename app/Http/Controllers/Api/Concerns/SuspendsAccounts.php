<?php

namespace App\Http\Controllers\Api\Concerns;

use App\Models\Account;

trait SuspendsAccounts
{
    protected function suspendAccount(Account $account, Account $admin, string $reasonCode): void
    {
        abort_unless($account->id !== $admin->id, 409, 'Admins cannot suspend their own account.');
        abort_unless($account->status !== Account::STATUS_SUSPENDED, 409, 'Account is already suspended.');

        $account->forceFill([
            'status' => Account::STATUS_SUSPENDED,
            'suspended_at' => now(),
            'suspension_reason' => $reasonCode,
        ])->save();
        $account->tokens()->delete();

        $account->loadMissing('therapistProfile');

        if ($account->therapistProfile) {
            $account->therapistProfile->forceFill([
                'is_online' => false,
                'online_since' => null,
            ])->save();
        }
    }

    protected function restoreAccount(Account $account): void
    {
        abort_unless($account->status === Account::STATUS_SUSPENDED, 409, 'Only suspended accounts can be restored.');

        $account->forceFill([
            'status' => Account::STATUS_ACTIVE,
            'suspended_at' => null,
            'suspension_reason' => null,
        ])->save();
    }
}
