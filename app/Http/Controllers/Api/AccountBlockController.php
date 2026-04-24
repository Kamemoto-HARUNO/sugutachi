<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AccountBlockResource;
use App\Models\Account;
use App\Models\AccountBlock;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class AccountBlockController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $validated = $request->validate([
            'reason_code' => ['nullable', 'string', 'max:100'],
            'q' => ['nullable', 'string', 'max:120'],
            'sort' => ['nullable', Rule::in(['created_at'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
        ]);

        $sort = $validated['sort'] ?? 'created_at';
        $direction = $validated['direction'] ?? 'desc';

        $blocks = AccountBlock::query()
            ->with(['blocker', 'blocked'])
            ->where('blocker_account_id', $request->user()->id)
            ->when(
                $validated['reason_code'] ?? null,
                fn ($query, string $reasonCode) => $query->where('reason_code', $reasonCode)
            )
            ->when(
                $validated['q'] ?? null,
                fn ($query, string $keyword) => $query->whereHas(
                    'blocked',
                    fn ($blockedQuery) => $blockedQuery->where('display_name', 'like', '%'.$keyword.'%')
                )
            )
            ->orderBy($sort, $direction)
            ->orderBy('id', $direction)
            ->get();

        return AccountBlockResource::collection($blocks)->additional([
            'meta' => [
                'total_count' => AccountBlock::query()
                    ->where('blocker_account_id', $request->user()->id)
                    ->count(),
                'filters' => [
                    'reason_code' => $validated['reason_code'] ?? null,
                    'q' => $validated['q'] ?? null,
                    'sort' => $sort,
                    'direction' => $direction,
                ],
            ],
        ]);
    }

    public function store(Request $request, Account $account): JsonResponse
    {
        abort_if($account->id === $request->user()->id, 422, 'You cannot block yourself.');

        $validated = $request->validate([
            'reason_code' => ['nullable', 'string', 'max:100'],
        ]);

        $block = AccountBlock::query()->updateOrCreate(
            [
                'blocker_account_id' => $request->user()->id,
                'blocked_account_id' => $account->id,
            ],
            [
                'reason_code' => $validated['reason_code'] ?? null,
            ],
        );

        return (new AccountBlockResource($block->load(['blocker', 'blocked'])))
            ->response()
            ->setStatusCode($block->wasRecentlyCreated ? 201 : 200);
    }

    public function destroy(Request $request, Account $account): JsonResponse
    {
        AccountBlock::query()
            ->where('blocker_account_id', $request->user()->id)
            ->where('blocked_account_id', $account->id)
            ->delete();

        return response()->json(status: 204);
    }
}
