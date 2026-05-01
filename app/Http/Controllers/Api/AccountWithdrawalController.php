<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Services\Accounts\AccountWithdrawalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AccountWithdrawalController extends Controller
{
    public function show(Request $request, AccountWithdrawalService $withdrawalService): JsonResponse
    {
        return response()->json([
            'data' => $withdrawalService->summary($request->user()),
        ]);
    }

    public function store(Request $request, AccountWithdrawalService $withdrawalService): JsonResponse
    {
        $validated = $request->validate([
            'reason_code' => ['required', 'string', Rule::in(array_keys(Account::withdrawalReasonOptions()))],
        ]);

        $withdrawalService->withdraw($request->user(), $validated['reason_code']);

        return response()->json([
            'message' => '退会が完了しました。',
        ]);
    }
}
