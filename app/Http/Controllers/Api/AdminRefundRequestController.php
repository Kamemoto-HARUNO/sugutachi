<?php

namespace App\Http\Controllers\Api;

use App\Contracts\Payments\RefundGateway;
use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Api\Concerns\RecordsAdminAuditLogs;
use App\Http\Controllers\Controller;
use App\Http\Resources\RefundResource;
use App\Models\PaymentIntent;
use App\Models\Refund;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

class AdminRefundRequestController extends Controller
{
    use AuthorizesAdminRequests;
    use RecordsAdminAuditLogs;

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorizeAdmin($request->user());

        return RefundResource::collection(
            Refund::query()
                ->with('booking')
                ->latest()
                ->get()
        );
    }

    public function approve(Request $request, Refund $refund, RefundGateway $gateway): RefundResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        $refund->load(['booking.currentPaymentIntent', 'paymentIntent']);

        abort_unless($refund->status === Refund::STATUS_REQUESTED, 409, 'Only requested refunds can be approved.');

        $maxAmount = $refund->requested_amount ?: $refund->booking->total_amount;
        $validated = $request->validate([
            'approved_amount' => ['nullable', 'integer', 'min:1', 'max:'.$maxAmount],
        ]);
        $approvedAmount = $validated['approved_amount'] ?? $maxAmount;
        $paymentIntent = $this->paymentIntentForRefund($refund);

        $createdRefund = $gateway->create($refund, $paymentIntent, $approvedAmount);
        $before = $this->snapshot($refund);

        DB::transaction(function () use ($admin, $approvedAmount, $createdRefund, $refund): void {
            $refund->forceFill([
                'status' => $createdRefund->status === 'succeeded'
                    ? Refund::STATUS_PROCESSED
                    : Refund::STATUS_APPROVED,
                'approved_amount' => $approvedAmount,
                'stripe_refund_id' => $createdRefund->id,
                'reviewed_by_account_id' => $admin->id,
                'reviewed_at' => now(),
                'processed_at' => $createdRefund->status === 'succeeded' ? now() : null,
            ])->save();
        });

        $this->recordAdminAudit($request, 'refund.approve', $refund, $before, $this->snapshot($refund->refresh()));

        return new RefundResource($refund->load('booking'));
    }

    public function reject(Request $request, Refund $refund): RefundResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);

        abort_unless($refund->status === Refund::STATUS_REQUESTED, 409, 'Only requested refunds can be rejected.');

        $validated = $request->validate([
            'reason_code' => ['required', 'string', 'max:100'],
        ]);
        $before = $this->snapshot($refund);

        $refund->forceFill([
            'status' => Refund::STATUS_REJECTED,
            'reason_code' => $validated['reason_code'],
            'reviewed_by_account_id' => $admin->id,
            'reviewed_at' => now(),
        ])->save();

        $this->recordAdminAudit($request, 'refund.reject', $refund, $before, $this->snapshot($refund->refresh()));

        return new RefundResource($refund->load('booking'));
    }

    private function paymentIntentForRefund(Refund $refund): PaymentIntent
    {
        $paymentIntent = $refund->paymentIntent ?: $refund->booking->currentPaymentIntent;

        abort_unless($paymentIntent, 409, 'Refund payment intent is missing.');
        abort_unless($paymentIntent->stripe_payment_intent_id, 409, 'Stripe PaymentIntent id is missing.');

        return $paymentIntent;
    }

    private function snapshot(Refund $refund): array
    {
        return $refund->only([
            'id',
            'public_id',
            'status',
            'reason_code',
            'requested_amount',
            'approved_amount',
            'stripe_refund_id',
            'reviewed_by_account_id',
            'reviewed_at',
            'processed_at',
        ]);
    }
}
