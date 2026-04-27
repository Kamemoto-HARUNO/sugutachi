<?php

namespace App\Http\Resources;

use App\Models\Refund;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class AdminBookingDetailResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'public_id' => $this->public_id,
            'status' => $this->status,
            'is_on_demand' => $this->is_on_demand,
            'requested_start_at' => $this->requested_start_at,
            'scheduled_start_at' => $this->scheduled_start_at,
            'scheduled_end_at' => $this->scheduled_end_at,
            'duration_minutes' => $this->duration_minutes,
            'request_expires_at' => $this->request_expires_at,
            'accepted_at' => $this->accepted_at,
            'confirmed_at' => $this->confirmed_at,
            'moving_at' => $this->moving_at,
            'arrived_at' => $this->arrived_at,
            'arrival_confirmation_code' => $this->arrival_confirmation_code,
            'arrival_confirmation_code_generated_at' => $this->arrival_confirmation_code_generated_at,
            'started_at' => $this->started_at,
            'ended_at' => $this->ended_at,
            'completed_at' => $this->completed_at,
            'canceled_at' => $this->canceled_at,
            'interrupted_at' => $this->interrupted_at,
            'cancel_reason_code' => $this->cancel_reason_code,
            'interruption_reason_code' => $this->interruption_reason_code,
            'cancel_reason_note' => $this->cancel_reason_note_encrypted
                ? rescue(fn () => Crypt::decryptString($this->cancel_reason_note_encrypted), null, false)
                : null,
            'total_amount' => $this->total_amount,
            'therapist_net_amount' => $this->therapist_net_amount,
            'platform_fee_amount' => $this->platform_fee_amount,
            'matching_fee_amount' => $this->matching_fee_amount,
            'user_account' => $this->whenLoaded('userAccount', fn () => $this->userAccount ? [
                'public_id' => $this->userAccount->public_id,
                'display_name' => $this->userAccount->display_name,
                'email' => $this->userAccount->email,
                'status' => $this->userAccount->status,
            ] : null),
            'therapist_account' => $this->whenLoaded('therapistAccount', fn () => $this->therapistAccount ? [
                'public_id' => $this->therapistAccount->public_id,
                'display_name' => $this->therapistAccount->display_name,
                'email' => $this->therapistAccount->email,
                'status' => $this->therapistAccount->status,
            ] : null),
            'therapist_profile' => $this->whenLoaded('therapistProfile', fn () => $this->therapistProfile ? [
                'public_id' => $this->therapistProfile->public_id,
                'public_name' => $this->therapistProfile->public_name,
                'profile_status' => $this->therapistProfile->profile_status,
            ] : null),
            'therapist_menu' => $this->whenLoaded('therapistMenu', fn () => $this->therapistMenu ? [
                'public_id' => $this->therapistMenu->public_id,
                'name' => $this->therapistMenu->name,
                'duration_minutes' => $this->therapistMenu->duration_minutes,
                'base_price_amount' => $this->therapistMenu->base_price_amount,
            ] : null),
            'service_address' => $this->whenLoaded(
                'serviceAddress',
                fn () => $this->serviceAddress ? new AdminServiceAddressResource($this->serviceAddress, includeSensitive: true) : null
            ),
            'canceled_by_account' => $this->whenLoaded('canceledBy', fn () => $this->canceledBy ? [
                'public_id' => $this->canceledBy->public_id,
                'display_name' => $this->canceledBy->display_name,
                'email' => $this->canceledBy->email,
                'status' => $this->canceledBy->status,
            ] : null),
            'user_snapshot' => $this->user_snapshot_json,
            'therapist_snapshot' => $this->therapist_snapshot_json,
            'current_quote' => $this->whenLoaded('currentQuote', fn () => $this->currentQuote ? new BookingQuoteResource($this->currentQuote) : null),
            'current_payment_intent' => $this->whenLoaded(
                'currentPaymentIntent',
                fn () => $this->currentPaymentIntent ? new AdminPaymentIntentResource($this->currentPaymentIntent) : null
            ),
            'interruption_report_count' => $this->whenLoaded('reports', fn () => $this->reports
                ->where('category', 'booking_interrupted')
                ->count()),
            'auto_refund_count' => $this->whenLoaded('refunds', fn () => $this->refunds
                ->where('reason_code', Refund::REASON_CODE_BOOKING_CANCELLATION_AUTO)
                ->count()),
            'refunds' => RefundResource::collection($this->whenLoaded('refunds')),
            'reports' => ReportResource::collection($this->whenLoaded('reports')),
            'consents' => AdminBookingConsentResource::collection($this->whenLoaded('consents')),
            'health_checks' => AdminBookingHealthCheckResource::collection($this->whenLoaded('healthChecks')),
            'status_logs' => AdminBookingStatusLogResource::collection($this->whenLoaded('statusLogs')),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
