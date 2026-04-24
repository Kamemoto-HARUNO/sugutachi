<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

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
            'started_at' => $this->started_at,
            'ended_at' => $this->ended_at,
            'canceled_at' => $this->canceled_at,
            'cancel_reason_code' => $this->cancel_reason_code,
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
            'user_snapshot' => $this->user_snapshot_json,
            'therapist_snapshot' => $this->therapist_snapshot_json,
            'current_quote' => $this->whenLoaded('currentQuote', fn () => $this->currentQuote ? new BookingQuoteResource($this->currentQuote) : null),
            'current_payment_intent' => $this->whenLoaded(
                'currentPaymentIntent',
                fn () => $this->currentPaymentIntent ? new AdminPaymentIntentResource($this->currentPaymentIntent) : null
            ),
            'refunds' => RefundResource::collection($this->whenLoaded('refunds')),
            'reports' => ReportResource::collection($this->whenLoaded('reports')),
            'status_logs' => AdminBookingStatusLogResource::collection($this->whenLoaded('statusLogs')),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
