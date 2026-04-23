<?php

namespace App\Http\Controllers\Api;

use App\Contracts\Payments\RefundGateway;
use App\Http\Controllers\Controller;
use App\Http\Resources\RefundResource;
use App\Models\Account;
use App\Models\AdminAuditLog;
use App\Models\PaymentIntent;
use App\Models\Refund;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

class AdminRefundRequestController extends Controller
{
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

        $this->audit($request, 'refund.approve', $refund, $before, $this->snapshot($refund->refresh()));

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

        $this->audit($request, 'refund.reject', $refund, $before, $this->snapshot($refund->refresh()));

        return new RefundResource($refund->load('booking'));
    }

    private function authorizeAdmin(Account $account): void
    {
        $isAdmin = $account->roleAssignments()
            ->where('role', 'admin')
            ->where('status', 'active')
            ->whereNull('revoked_at')
            ->exists();

        abort_unless($isAdmin, 403);
    }

    private function paymentIntentForRefund(Refund $refund): PaymentIntent
    {
        $paymentIntent = $refund->paymentIntent ?: $refund->booking->currentPaymentIntent;

        abort_unless($paymentIntent, 409, 'Refund payment intent is missing.');
        abort_unless($paymentIntent->stripe_payment_intent_id, 409, 'Stripe PaymentIntent id is missing.');

        return $paymentIntent;
    }

    private function audit(Request $request, string $action, Refund $refund, array $before, array $after): void
    {
        AdminAuditLog::create([
            'actor_account_id' => $request->user()->id,
            'action' => $action,
            'target_type' => Refund::class,
            'target_id' => $refund->id,
            'ip_hash' => $request->ip() ? hash('sha256', $request->ip()) : null,
            'user_agent_hash' => $request->userAgent() ? hash('sha256', $request->userAgent()) : null,
            'before_json' => $before,
            'after_json' => $after,
            'created_at' => now(),
        ]);
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
