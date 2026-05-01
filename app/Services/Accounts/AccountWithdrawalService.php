<?php

namespace App\Services\Accounts;

use App\Models\Account;
use App\Models\Booking;
use App\Models\PayoutRequest;
use App\Models\TherapistLedgerEntry;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class AccountWithdrawalService
{
    private const BLOCKING_BOOKING_STATUSES = [
        Booking::STATUS_PAYMENT_AUTHORIZING,
        Booking::STATUS_REQUESTED,
        Booking::STATUS_ACCEPTED,
        Booking::STATUS_MOVING,
        Booking::STATUS_ARRIVED,
        Booking::STATUS_IN_PROGRESS,
        Booking::STATUS_THERAPIST_COMPLETED,
    ];

    /**
     * @return array{
     *     can_withdraw: bool,
     *     reason_options: array<int, array{code: string, label: string}>,
     *     blocking_booking_count: int,
     *     next_blocking_booking: array{public_id: string, role: string, status: string, scheduled_start_at: string|null}|null,
     *     has_processing_payout_request: bool,
     *     remaining_balance_amount: int,
     *     balance: array{pending_amount: int, available_amount: int, payout_requested_amount: int, held_amount: int}
     * }
     */
    public function summary(Account $account): array
    {
        $nextBlockingBooking = $this->nextBlockingBooking($account);
        $balance = $this->balanceSummary($account);
        $hasProcessingPayoutRequest = $this->hasProcessingPayoutRequest($account);

        return [
            'can_withdraw' => $nextBlockingBooking === null && ! $hasProcessingPayoutRequest,
            'reason_options' => collect(Account::withdrawalReasonOptions())
                ->map(fn (string $label, string $code) => [
                    'code' => $code,
                    'label' => $label,
                ])
                ->values()
                ->all(),
            'blocking_booking_count' => $this->blockingBookingCount($account),
            'next_blocking_booking' => $nextBlockingBooking,
            'has_processing_payout_request' => $hasProcessingPayoutRequest,
            'remaining_balance_amount' => $balance['pending_amount']
                + $balance['available_amount']
                + $balance['payout_requested_amount']
                + $balance['held_amount'],
            'balance' => $balance,
        ];
    }

    public function withdraw(Account $account, string $reasonCode): void
    {
        DB::transaction(function () use ($account, $reasonCode): void {
            $lockedAccount = Account::query()
                ->whereKey($account->id)
                ->lockForUpdate()
                ->firstOrFail();

            $this->assertCanWithdraw($lockedAccount);

            $lockedAccount->loadMissing('therapistProfile');

            $lockedAccount->forceFill([
                'status' => Account::STATUS_WITHDRAWN,
                'withdrawn_at' => now(),
                'withdrawal_reason_code' => $reasonCode,
            ])->save();

            $lockedAccount->tokens()->delete();
            $lockedAccount->pushSubscriptions()->delete();

            if ($lockedAccount->therapistProfile) {
                $lockedAccount->therapistProfile->forceFill([
                    'is_online' => false,
                    'online_since' => null,
                    'is_listed' => false,
                ])->save();
            }

            $cancelablePayoutRequestIds = PayoutRequest::query()
                ->where('therapist_account_id', $lockedAccount->id)
                ->whereIn('status', [
                    PayoutRequest::STATUS_REQUESTED,
                    PayoutRequest::STATUS_HELD,
                ])
                ->pluck('id');

            if ($cancelablePayoutRequestIds->isNotEmpty()) {
                PayoutRequest::query()
                    ->whereKey($cancelablePayoutRequestIds)
                    ->update([
                        'status' => PayoutRequest::STATUS_FAILED,
                        'failure_reason' => 'account_withdrawn',
                        'processed_at' => now(),
                        'updated_at' => now(),
                    ]);

                TherapistLedgerEntry::query()
                    ->whereIn('payout_request_id', $cancelablePayoutRequestIds)
                    ->update([
                        'payout_request_id' => null,
                        'status' => TherapistLedgerEntry::STATUS_HELD,
                        'updated_at' => now(),
                    ]);
            }

            TherapistLedgerEntry::query()
                ->where('therapist_account_id', $lockedAccount->id)
                ->whereIn('status', [
                    TherapistLedgerEntry::STATUS_PENDING,
                    TherapistLedgerEntry::STATUS_AVAILABLE,
                ])
                ->update([
                    'status' => TherapistLedgerEntry::STATUS_HELD,
                    'updated_at' => now(),
                ]);
        });
    }

    public function assertCanWithdraw(Account $account): void
    {
        abort_if(
            $account->status === Account::STATUS_WITHDRAWN,
            409,
            'このアカウントはすでに退会済みです。'
        );

        abort_if(
            $this->blockingBookingCount($account) > 0,
            409,
            '進行中または未完了の予約があるため、いまは退会できません。'
        );

        abort_if(
            $this->hasProcessingPayoutRequest($account),
            409,
            '出金処理中の申請があるため、いまは退会できません。処理完了後にもう一度お試しください。'
        );
    }

    /**
     * @return array{pending_amount: int, available_amount: int, payout_requested_amount: int, held_amount: int}
     */
    private function balanceSummary(Account $account): array
    {
        $entries = $account->ledgerEntries()->get();

        return [
            'pending_amount' => $this->sumLedgerEntries($entries, TherapistLedgerEntry::STATUS_PENDING),
            'available_amount' => $this->sumLedgerEntries($entries, TherapistLedgerEntry::STATUS_AVAILABLE),
            'payout_requested_amount' => $this->sumLedgerEntries($entries, TherapistLedgerEntry::STATUS_PAYOUT_REQUESTED),
            'held_amount' => $this->sumLedgerEntries($entries, TherapistLedgerEntry::STATUS_HELD),
        ];
    }

    private function blockingBookingCount(Account $account): int
    {
        return Booking::query()
            ->whereIn('status', self::BLOCKING_BOOKING_STATUSES)
            ->where(function ($query) use ($account): void {
                $query
                    ->where('user_account_id', $account->id)
                    ->orWhere('therapist_account_id', $account->id);
            })
            ->count();
    }

    /**
     * @return array{public_id: string, role: string, status: string, scheduled_start_at: string|null}|null
     */
    private function nextBlockingBooking(Account $account): ?array
    {
        $booking = Booking::query()
            ->whereIn('status', self::BLOCKING_BOOKING_STATUSES)
            ->where(function ($query) use ($account): void {
                $query
                    ->where('user_account_id', $account->id)
                    ->orWhere('therapist_account_id', $account->id);
            })
            ->orderByRaw('coalesce(scheduled_start_at, requested_start_at) asc')
            ->orderBy('id')
            ->first();

        if (! $booking) {
            return null;
        }

        return [
            'public_id' => $booking->public_id,
            'role' => $booking->therapist_account_id === $account->id ? 'therapist' : 'user',
            'status' => $booking->status,
            'scheduled_start_at' => $booking->scheduled_start_at?->toIso8601String()
                ?? $booking->requested_start_at?->toIso8601String(),
        ];
    }

    private function hasProcessingPayoutRequest(Account $account): bool
    {
        return $account->payoutRequests()
            ->where('status', PayoutRequest::STATUS_PROCESSING)
            ->exists();
    }

    private function sumLedgerEntries(Collection $entries, string $status): int
    {
        return (int) $entries
            ->where('status', $status)
            ->sum('amount_signed');
    }
}
