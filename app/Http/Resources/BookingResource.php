<?php

namespace App\Http\Resources;

use App\Models\Refund;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class BookingResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'public_id' => $this->public_id,
            'status' => $this->status,
            'is_on_demand' => $this->is_on_demand,
            'availability_slot_id' => $this->currentQuote?->input_snapshot_json['availability_slot_id']
                ?? $this->whenLoaded('availabilitySlot', fn () => $this->availabilitySlot?->public_id),
            'requested_start_at' => $this->requested_start_at,
            'scheduled_start_at' => $this->scheduled_start_at,
            'scheduled_end_at' => $this->scheduled_end_at,
            'duration_minutes' => $this->duration_minutes,
            'buffer_before_minutes' => $this->buffer_before_minutes,
            'buffer_after_minutes' => $this->buffer_after_minutes,
            'request_expires_at' => $this->request_expires_at,
            'accepted_at' => $this->accepted_at,
            'confirmed_at' => $this->confirmed_at,
            'moving_at' => $this->moving_at,
            'arrived_at' => $this->arrived_at,
            'started_at' => $this->started_at,
            'ended_at' => $this->ended_at,
            'canceled_at' => $this->canceled_at,
            'cancel_reason_code' => $this->cancel_reason_code,
            'cancel_reason_note' => $this->cancel_reason_note_encrypted
                ? rescue(fn () => Crypt::decryptString($this->cancel_reason_note_encrypted), null, false)
                : null,
            'canceled_by_role' => $this->canceledByRole(),
            'canceled_by_account' => $this->whenLoaded('canceledBy', fn () => $this->canceledBy
                ? [
                    'public_id' => $this->canceledBy->public_id,
                    'display_name' => $this->canceledBy->display_name,
                ]
                : null),
            'total_amount' => $this->total_amount,
            'therapist_net_amount' => $this->therapist_net_amount,
            'platform_fee_amount' => $this->platform_fee_amount,
            'matching_fee_amount' => $this->matching_fee_amount,
            'current_quote' => $this->whenLoaded('currentQuote', fn () => new BookingQuoteResource($this->currentQuote)),
            'current_payment_intent' => $this->whenLoaded('currentPaymentIntent', fn () => $this->currentPaymentIntent
                ? new PaymentIntentResource($this->currentPaymentIntent)
                : null),
            'refund_breakdown' => $this->whenLoaded('refunds', fn () => $this->refundBreakdown()),
            'refunds' => $this->whenLoaded('refunds', fn () => BookingRefundResource::collection($this->refunds)),
            'consents' => $this->whenLoaded('consents', fn () => BookingConsentResource::collection($this->consents)),
            'health_checks' => $this->whenLoaded('healthChecks', fn () => BookingHealthCheckResource::collection($this->healthChecks)),
            'created_at' => $this->created_at,
        ];
    }

    private function canceledByRole(): ?string
    {
        if ($this->canceled_by_account_id === null) {
            return null;
        }

        return match ($this->canceled_by_account_id) {
            $this->user_account_id => 'user',
            $this->therapist_account_id => 'therapist',
            default => 'admin',
        };
    }

    private function refundBreakdown(): array
    {
        return [
            'refund_count' => $this->refunds->count(),
            'auto_refund_count' => $this->refunds
                ->where('reason_code', Refund::REASON_CODE_BOOKING_CANCELLATION_AUTO)
                ->count(),
            'requested_amount_total' => (int) $this->refunds->sum('requested_amount'),
            'approved_amount_total' => (int) $this->refunds
                ->sum(fn (Refund $refund) => $refund->approved_amount ?? 0),
            'processed_amount_total' => (int) $this->refunds
                ->sum(fn (Refund $refund) => $refund->status === Refund::STATUS_PROCESSED
                    ? ($refund->approved_amount ?? $refund->requested_amount ?? 0)
                    : 0),
        ];
    }
}
