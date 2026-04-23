<?php

namespace App\Http\Controllers\Api;

use App\Contracts\Payments\PayoutGateway;
use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Api\Concerns\RecordsAdminAuditLogs;
use App\Http\Controllers\Controller;
use App\Http\Resources\PayoutRequestResource;
use App\Models\PayoutRequest;
use App\Models\StripeConnectedAccount;
use App\Models\TherapistLedgerEntry;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

class AdminPayoutRequestController extends Controller
{
    use AuthorizesAdminRequests;
    use RecordsAdminAuditLogs;

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorizeAdmin($request->user());

        return PayoutRequestResource::collection(
            PayoutRequest::query()
                ->with(['therapistAccount', 'stripeConnectedAccount'])
                ->latest()
                ->get()
        );
    }

    public function hold(Request $request, PayoutRequest $payoutRequest): PayoutRequestResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        abort_unless($payoutRequest->status === PayoutRequest::STATUS_REQUESTED, 409, 'Only requested payouts can be held.');

        $before = $this->snapshot($payoutRequest);

        DB::transaction(function () use ($admin, $payoutRequest): void {
            $lockedPayoutRequest = PayoutRequest::query()
                ->whereKey($payoutRequest->id)
                ->lockForUpdate()
                ->firstOrFail();

            abort_unless($lockedPayoutRequest->status === PayoutRequest::STATUS_REQUESTED, 409, 'Only requested payouts can be held.');

            $lockedPayoutRequest->forceFill([
                'status' => PayoutRequest::STATUS_HELD,
                'reviewed_by_account_id' => $admin->id,
            ])->save();

            $lockedPayoutRequest->ledgerEntries()->update([
                'status' => TherapistLedgerEntry::STATUS_HELD,
                'updated_at' => now(),
            ]);
        });

        $this->recordAdminAudit($request, 'payout.hold', $payoutRequest, $before, $this->snapshot($payoutRequest->refresh()));

        return new PayoutRequestResource($payoutRequest->load(['therapistAccount', 'stripeConnectedAccount', 'ledgerEntries']));
    }

    public function release(Request $request, PayoutRequest $payoutRequest): PayoutRequestResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        abort_unless($payoutRequest->status === PayoutRequest::STATUS_HELD, 409, 'Only held payouts can be released.');

        $before = $this->snapshot($payoutRequest);

        DB::transaction(function () use ($admin, $payoutRequest): void {
            $lockedPayoutRequest = PayoutRequest::query()
                ->whereKey($payoutRequest->id)
                ->lockForUpdate()
                ->firstOrFail();

            abort_unless($lockedPayoutRequest->status === PayoutRequest::STATUS_HELD, 409, 'Only held payouts can be released.');

            $lockedPayoutRequest->forceFill([
                'status' => PayoutRequest::STATUS_REQUESTED,
                'reviewed_by_account_id' => $admin->id,
            ])->save();

            $lockedPayoutRequest->ledgerEntries()->update([
                'status' => TherapistLedgerEntry::STATUS_PAYOUT_REQUESTED,
                'updated_at' => now(),
            ]);
        });

        $this->recordAdminAudit($request, 'payout.release', $payoutRequest, $before, $this->snapshot($payoutRequest->refresh()));

        return new PayoutRequestResource($payoutRequest->load(['therapistAccount', 'stripeConnectedAccount', 'ledgerEntries']));
    }

    public function process(Request $request, PayoutRequest $payoutRequest, PayoutGateway $gateway): PayoutRequestResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        $payoutRequest->load('stripeConnectedAccount');

        $validated = $request->validate([
            'force' => ['nullable', 'boolean'],
        ]);

        abort_unless($payoutRequest->status === PayoutRequest::STATUS_REQUESTED, 409, 'Only requested payouts can be processed.');
        abort_unless(
            ($validated['force'] ?? false) || $payoutRequest->scheduled_process_date->isPast() || $payoutRequest->scheduled_process_date->isToday(),
            409,
            'Payout is not scheduled for processing yet.'
        );
        $this->assertPayoutReady($payoutRequest->stripeConnectedAccount);

        $before = $this->snapshot($payoutRequest);
        $createdPayout = $gateway->create($payoutRequest);
        $status = $this->statusForStripePayout($createdPayout->status);

        DB::transaction(function () use ($admin, $createdPayout, $payoutRequest, $status): void {
            $lockedPayoutRequest = PayoutRequest::query()
                ->whereKey($payoutRequest->id)
                ->lockForUpdate()
                ->firstOrFail();

            abort_unless($lockedPayoutRequest->status === PayoutRequest::STATUS_REQUESTED, 409, 'Only requested payouts can be processed.');

            $lockedPayoutRequest->forceFill([
                'status' => $status,
                'stripe_payout_id' => $createdPayout->id,
                'failure_reason' => $createdPayout->failureReason,
                'reviewed_by_account_id' => $admin->id,
                'processed_at' => now(),
            ])->save();

            if ($status === PayoutRequest::STATUS_PAID) {
                $lockedPayoutRequest->ledgerEntries()->update([
                    'status' => TherapistLedgerEntry::STATUS_PAID,
                    'updated_at' => now(),
                ]);
            }
        });

        $this->recordAdminAudit($request, 'payout.process', $payoutRequest, $before, $this->snapshot($payoutRequest->refresh()));

        return new PayoutRequestResource($payoutRequest->load(['therapistAccount', 'stripeConnectedAccount', 'ledgerEntries']));
    }

    private function assertPayoutReady(?StripeConnectedAccount $connectedAccount): void
    {
        abort_unless($connectedAccount, 409, 'Stripe Connected Account is missing.');
        abort_unless($connectedAccount->status === StripeConnectedAccount::STATUS_ACTIVE, 409, 'Stripe Connected Account is not active.');
        abort_unless($connectedAccount->payouts_enabled, 409, 'Stripe payouts are not enabled.');
    }

    private function statusForStripePayout(string $stripeStatus): string
    {
        return match ($stripeStatus) {
            'paid' => PayoutRequest::STATUS_PAID,
            'failed', 'canceled' => PayoutRequest::STATUS_FAILED,
            default => PayoutRequest::STATUS_PROCESSING,
        };
    }

    private function snapshot(PayoutRequest $payoutRequest): array
    {
        return $payoutRequest->only([
            'id',
            'public_id',
            'status',
            'requested_amount',
            'fee_amount',
            'net_amount',
            'scheduled_process_date',
            'processed_at',
            'stripe_payout_id',
            'failure_reason',
            'reviewed_by_account_id',
        ]);
    }
}
