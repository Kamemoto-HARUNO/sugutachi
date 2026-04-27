<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\RefundResource;
use App\Models\Booking;
use App\Models\Refund;
use App\Services\Notifications\AdminNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;

class RefundRequestController extends Controller
{
    private const REFUNDABLE_BOOKING_STATUSES = [
        Booking::STATUS_THERAPIST_COMPLETED,
        Booking::STATUS_COMPLETED,
        Booking::STATUS_CANCELED,
    ];

    public function index(Request $request, Booking $booking): AnonymousResourceCollection
    {
        $this->authorizeParticipant($request, $booking);

        return RefundResource::collection(
            $booking->refunds()
                ->with('booking')
                ->latest()
                ->get()
        );
    }

    public function store(Request $request, Booking $booking, AdminNotificationService $adminNotificationService): JsonResponse
    {
        abort_unless($booking->user_account_id === $request->user()->id, 404);
        abort_unless(in_array($booking->status, self::REFUNDABLE_BOOKING_STATUSES, true), 409, 'この予約は、まだ返金申請を受け付けられません。');

        $validated = $request->validate([
            'reason_code' => ['required', 'string', 'max:100'],
            'detail' => ['nullable', 'string', 'max:2000'],
            'requested_amount' => ['nullable', 'integer', 'min:1', 'max:'.$booking->total_amount],
        ]);

        $hasOpenRefund = $booking->refunds()
            ->whereIn('status', [Refund::STATUS_REQUESTED, Refund::STATUS_APPROVED])
            ->exists();

        abort_if($hasOpenRefund, 409, 'この予約には、すでに対応中の返金申請があります。');

        $booking->load('currentPaymentIntent');

        $refund = Refund::create([
            'public_id' => 'ref_'.Str::ulid(),
            'booking_id' => $booking->id,
            'payment_intent_id' => $booking->currentPaymentIntent?->id,
            'requested_by_account_id' => $request->user()->id,
            'status' => Refund::STATUS_REQUESTED,
            'reason_code' => $validated['reason_code'],
            'detail_encrypted' => filled($validated['detail'] ?? null)
                ? Crypt::encryptString($validated['detail'])
                : null,
            'requested_amount' => $validated['requested_amount'] ?? $booking->total_amount,
        ]);

        $adminNotificationService->notifyRefundRequested($refund->fresh(['booking', 'requestedBy']));

        return (new RefundResource($refund->load('booking')))
            ->response()
            ->setStatusCode(201);
    }

    public function show(Request $request, Refund $refund): RefundResource
    {
        $refund->load('booking');
        $this->authorizeParticipant($request, $refund->booking);

        return new RefundResource($refund);
    }

    private function authorizeParticipant(Request $request, Booking $booking): void
    {
        $accountId = $request->user()->id;

        abort_unless(
            $booking->user_account_id === $accountId || $booking->therapist_account_id === $accountId,
            404
        );
    }
}
