<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PayoutRequestResource;
use App\Models\PayoutRequest;
use App\Models\StripeConnectedAccount;
use App\Models\TherapistLedgerEntry;
use App\Services\Notifications\AdminNotificationService;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class TherapistPayoutRequestController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $request->user()->ensureTherapistProfile();

        return PayoutRequestResource::collection(
            $request->user()
                ->payoutRequests()
                ->latest()
                ->get()
        );
    }

    public function show(Request $request, PayoutRequest $payoutRequest): PayoutRequestResource
    {
        $request->user()->ensureTherapistProfile();
        abort_unless($payoutRequest->therapist_account_id === $request->user()->id, 404);

        return new PayoutRequestResource(
            $payoutRequest->load(['ledgerEntries.booking'])
        );
    }

    public function store(Request $request, AdminNotificationService $adminNotificationService): JsonResponse
    {
        $account = $request->user();
        $therapistProfile = $account->ensureTherapistProfile()->load('stripeConnectedAccount');

        $connectedAccount = $therapistProfile->stripeConnectedAccount;
        $this->assertPayoutReady($connectedAccount);

        $availableAmount = $this->availableAmount($account->id);
        $validated = $request->validate([
            'requested_amount' => ['nullable', 'integer', 'min:1', 'max:'.$availableAmount],
        ]);
        $requestedAmount = $validated['requested_amount'] ?? $availableAmount;

        abort_unless($requestedAmount > 0, 409, '出金申請できる残高がありません。');
        abort_unless(
            $requestedAmount === $availableAmount,
            422,
            '現在は出金可能額の全額をまとめて申請してください。'
        );

        $payoutRequest = DB::transaction(function () use ($account, $connectedAccount, $requestedAmount): PayoutRequest {
            $entries = TherapistLedgerEntry::query()
                ->where('therapist_account_id', $account->id)
                ->where('status', TherapistLedgerEntry::STATUS_AVAILABLE)
                ->whereNull('payout_request_id')
                ->where(fn ($query) => $query
                    ->whereNull('available_at')
                    ->orWhere('available_at', '<=', now()))
                ->lockForUpdate()
                ->get();

            abort_unless($entries->sum('amount_signed') === $requestedAmount, 409, '出金可能額が更新されました。もう一度やり直してください。');

            $payoutRequest = PayoutRequest::create([
                'public_id' => 'pay_'.Str::ulid(),
                'therapist_account_id' => $account->id,
                'stripe_connected_account_id' => $connectedAccount->id,
                'status' => PayoutRequest::STATUS_REQUESTED,
                'requested_amount' => $requestedAmount,
                'fee_amount' => 0,
                'net_amount' => $requestedAmount,
                'requested_at' => now(),
                'scheduled_process_date' => $this->scheduledProcessDate(now()),
            ]);

            TherapistLedgerEntry::query()
                ->whereKey($entries->pluck('id'))
                ->update([
                    'payout_request_id' => $payoutRequest->id,
                    'status' => TherapistLedgerEntry::STATUS_PAYOUT_REQUESTED,
                    'updated_at' => now(),
                ]);

            return $payoutRequest;
        });

        $adminNotificationService->notifyPayoutRequested($payoutRequest->fresh('therapistAccount'));

        return (new PayoutRequestResource($payoutRequest))
            ->response()
            ->setStatusCode(201);
    }

    private function assertPayoutReady(?StripeConnectedAccount $connectedAccount): void
    {
        abort_unless($connectedAccount, 409, '受取口座が未設定です。先に受取設定を完了してください。');

        if ($connectedAccount->usesManualBankTransfer()) {
            abort_unless(
                $connectedAccount->isPayoutReady(),
                409,
                '受取口座の入力が完了していません。銀行名、支店名、口座種別、口座番号、口座名義を確認してください。'
            );

            return;
        }

        abort_unless($connectedAccount->status === StripeConnectedAccount::STATUS_ACTIVE, 409, '受取設定がまだ有効になっていません。');
        abort_unless($connectedAccount->payouts_enabled, 409, '出金を受け付けるには追加の受取設定が必要です。');
    }

    private function availableAmount(int $accountId): int
    {
        return (int) TherapistLedgerEntry::query()
            ->where('therapist_account_id', $accountId)
            ->where('status', TherapistLedgerEntry::STATUS_AVAILABLE)
            ->whereNull('payout_request_id')
            ->where(fn ($query) => $query
                ->whereNull('available_at')
                ->orWhere('available_at', '<=', now()))
            ->sum('amount_signed');
    }

    private function scheduledProcessDate(CarbonImmutable|CarbonInterface $requestedAt): CarbonImmutable
    {
        $date = CarbonImmutable::instance($requestedAt);
        $day = $date->day;

        return match (true) {
            $day <= 10 => $date->day(15)->startOfDay(),
            $day <= 20 => $date->day(25)->startOfDay(),
            default => $date->addMonthNoOverflow()->day(5)->startOfDay(),
        };
    }
}
