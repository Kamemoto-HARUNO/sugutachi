<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Controller;
use App\Http\Resources\AdminAuditLogResource;
use App\Models\Account;
use App\Models\AdminAuditLog;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class AdminAuditLogController extends Controller
{
    use AuthorizesAdminRequests;

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorizeAdmin($request->user());

        $validated = $request->validate([
            'actor_account_id' => ['nullable', 'string', 'max:36'],
            'action' => ['nullable', 'string', 'max:100'],
            'target_type' => ['nullable', 'string', 'max:100'],
            'target_id' => ['nullable', 'integer', 'min:1'],
        ]);

        $actorId = null;
        if (filled($validated['actor_account_id'] ?? null)) {
            $actorId = Account::query()
                ->where('public_id', $validated['actor_account_id'])
                ->value('id');

            abort_unless($actorId, 404);
        }

        return AdminAuditLogResource::collection(
            AdminAuditLog::query()
                ->with('actor')
                ->when($actorId, fn ($query, int $id) => $query->where('actor_account_id', $id))
                ->when($validated['action'] ?? null, fn ($query, string $action) => $query->where('action', $action))
                ->when($validated['target_type'] ?? null, fn ($query, string $targetType) => $query->where('target_type', $targetType))
                ->when($validated['target_id'] ?? null, fn ($query, int $targetId) => $query->where('target_id', $targetId))
                ->latest('created_at')
                ->get()
        );
    }
}
