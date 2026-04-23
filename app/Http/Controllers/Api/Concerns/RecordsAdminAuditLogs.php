<?php

namespace App\Http\Controllers\Api\Concerns;

use App\Models\AdminAuditLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

trait RecordsAdminAuditLogs
{
    protected function recordAdminAudit(Request $request, string $action, Model $target, array $before, array $after): void
    {
        AdminAuditLog::create([
            'actor_account_id' => $request->user()->id,
            'action' => $action,
            'target_type' => $target::class,
            'target_id' => $target->getKey(),
            'ip_hash' => $request->ip() ? hash('sha256', $request->ip()) : null,
            'user_agent_hash' => $request->userAgent() ? hash('sha256', $request->userAgent()) : null,
            'before_json' => $before,
            'after_json' => $after,
            'created_at' => now(),
        ]);
    }
}
