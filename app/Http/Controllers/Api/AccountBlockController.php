<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AccountBlockResource;
use App\Models\Account;
use App\Models\AccountBlock;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AccountBlockController extends Controller
{
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
