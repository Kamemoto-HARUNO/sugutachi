<?php

namespace App\Services\DirectMessages;

use App\Contracts\Payments\CreatedRefund;
use App\Contracts\Payments\PaymentIntentGateway;
use App\Contracts\Payments\PaymentStateGateway;
use App\Contracts\Payments\RefundGateway;
use App\Models\Booking;
use App\Models\Refund;
use App\Services\Campaigns\CampaignService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class BlockBookingSettlement
{
    public function __construct(private PaymentStateGateway $states, private PaymentIntentGateway $payments, private RefundGateway $refunds) {}

    public function run(): void
    {
        foreach (DB::table('block_booking_actions')->whereIn('status', ['pending', 'processing'])->where('due_at', '<=', now())->orderBy('id')->limit(50)->get() as $action) {
            $lock = Cache::lock('block-settle.'.$action->id, 180);
            if (! $lock->get()) {
                continue;
            }
            try {
                $this->settle($action);
            } finally {
                $lock->release();
            }
        }
    }

    private function settle(object $action): void
    {
        $action = DB::table('block_booking_actions')->where('id', $action->id)->whereIn('status', ['pending', 'processing'])->where('due_at', '<=', now())->first();
        if (! $action) {
            return;
        }
        DB::table('block_booking_actions')->where('id', $action->id)->update(['status' => 'processing', 'attempts' => $action->attempts + 1, 'due_at' => now()->addMinutes(5), 'updated_at' => now()]);
        try {
            $booking = Booking::findOrFail($action->booking_id);
            $pending = false;
            foreach ($booking->paymentIntents()->get() as $payment) {
                if (! $payment->stripe_payment_intent_id) {
                    continue;
                }
                $state = $this->states->retrieve($payment);
                $payment->update(['status' => $state['status']]);
                if ($state['status'] === 'canceled') {
                    continue;
                }
                if ($state['status'] !== 'succeeded') {
                    $status = $this->payments->cancel($payment);
                    $payment->update(['status' => $status, 'canceled_at' => $status === 'canceled' ? now() : null]);
                    $pending = $pending || $status !== 'canceled';

                    continue;
                }
                $refund = Refund::query()->where('payment_intent_id', $payment->id)->where('reason_code', 'therapist_relationship_block')->first();
                if (! $refund && $state['refundable_amount'] === 0) {
                    continue;
                }
                // Persist the refund ID before calling Stripe so retries keep the same key.
                $refund ??= Refund::create(['public_id' => 'ref_'.Str::ulid(), 'booking_id' => $booking->id, 'payment_intent_id' => $payment->id, 'requested_by_account_id' => $booking->therapist_account_id, 'reason_code' => 'therapist_relationship_block', 'status' => 'requested', 'requested_amount' => $state['refundable_amount']]);
                if ($refund->status === Refund::STATUS_PROCESSED) {
                    continue;
                }
                if (! $refund->stripe_refund_id) {
                    if ($refund->created_at->lessThan(now()->subHours(23))) {
                        $known = $this->states->findRefund($payment, $refund->public_id);
                        if (! $known) {
                            throw new \RuntimeException('Refund outcome requires manual reconciliation.');
                        }
                        $result = new CreatedRefund($known['id'], $known['status']);
                    } else {
                        $result = $this->refunds->create($refund, $payment, $refund->requested_amount);
                    }
                    $refund->update(['stripe_refund_id' => $result->id, 'approved_amount' => $refund->requested_amount, 'reviewed_at' => now()]);
                    $status = $result->status;
                } else {
                    $status = $this->states->refundStatus($refund->stripe_refund_id);
                }
                if (in_array($status, ['failed', 'canceled'], true)) {
                    throw new \RuntimeException('Refund requires review.');
                }
                $refund->update(['status' => $status === 'succeeded' ? Refund::STATUS_PROCESSED : Refund::STATUS_APPROVED, 'processed_at' => $status === 'succeeded' ? now() : null]);
                $pending = $pending || $status !== 'succeeded';
            }
            if ($pending) {
                $review = $action->attempts >= 3;
                DB::table('block_booking_actions')->where('id', $action->id)->update(['status' => $review ? 'review' : 'pending']);
                if ($review) {
                    app(SystemNotice::class)->booking($booking, 'review');
                }

                return;
            }
            DB::transaction(function () use ($booking, $action) {
                $balance = (int) $booking->ledgerEntries()->whereIn('entry_type', ['booking_sale', 'refund_adjustment'])->sum('amount_signed');
                if ($balance > 0) {
                    $booking->ledgerEntries()->create(['therapist_account_id' => $booking->therapist_account_id, 'entry_type' => 'refund_adjustment', 'amount_signed' => -$balance, 'status' => 'available', 'available_at' => now(), 'metadata_json' => ['block_booking_action_id' => $action->id]]);
                }
                app(CampaignService::class)->restoreBookingCampaignApplication($booking, 'therapist_relationship_block');
                DB::table('block_booking_actions')->where('id', $action->id)->update(['status' => 'complete', 'completed_at' => now(), 'updated_at' => now()]);
                app(SystemNotice::class)->booking($booking, 'complete');
            });
        } catch (\Throwable $e) {
            $review = $action->attempts >= 3;
            DB::table('block_booking_actions')->where('id', $action->id)->update(['status' => $review ? 'review' : 'pending', 'due_at' => now()->addMinutes(5), 'updated_at' => now()]);
            if ($review && isset($booking)) {
                app(SystemNotice::class)->booking($booking, 'review');
            }
            Log::warning('Block cancellation settlement needs attention.', ['action_id' => $action->id, 'requires_review' => $review]);
        }
    }
}
