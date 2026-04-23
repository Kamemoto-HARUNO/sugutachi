<?php

namespace App\Http\Controllers\Api\Concerns;

use App\Models\Account;

trait AuthorizesAdminRequests
{
    protected function authorizeAdmin(Account $account): void
    {
        $isAdmin = $account->roleAssignments()
            ->where('role', 'admin')
            ->where('status', 'active')
            ->whereNull('revoked_at')
            ->exists();

        abort_unless($isAdmin, 403);
    }
}
