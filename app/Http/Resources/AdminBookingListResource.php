<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class AdminBookingListResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'public_id' => $this->public_id,
            'status' => $this->status,
            'is_on_demand' => $this->is_on_demand,
            'scheduled_start_at' => $this->scheduled_start_at,
            'scheduled_end_at' => $this->scheduled_end_at,
            'duration_minutes' => $this->duration_minutes,
            'cancel_reason_code' => $this->cancel_reason_code,
            'interruption_reason_code' => $this->interruption_reason_code,
            'interrupted_at' => $this->interrupted_at,
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
            ] : null),
            'therapist_account' => $this->whenLoaded('therapistAccount', fn () => $this->therapistAccount ? [
                'public_id' => $this->therapistAccount->public_id,
                'display_name' => $this->therapistAccount->display_name,
                'email' => $this->therapistAccount->email,
            ] : null),
            'therapist_profile' => $this->whenLoaded('therapistProfile', fn () => $this->therapistProfile ? [
                'public_id' => $this->therapistProfile->public_id,
                'public_name' => $this->therapistProfile->public_name,
            ] : null),
            'therapist_menu' => $this->whenLoaded('therapistMenu', fn () => $this->therapistMenu ? [
                'public_id' => $this->therapistMenu->public_id,
                'name' => $this->therapistMenu->name,
            ] : null),
            'service_address' => $this->whenLoaded(
                'serviceAddress',
                fn () => $this->serviceAddress ? new AdminServiceAddressResource($this->serviceAddress) : null
            ),
            'canceled_by_account' => $this->whenLoaded('canceledBy', fn () => $this->canceledBy ? [
                'public_id' => $this->canceledBy->public_id,
                'display_name' => $this->canceledBy->display_name,
                'email' => $this->canceledBy->email,
                'status' => $this->canceledBy->status,
            ] : null),
            'current_payment_intent_status' => $this->whenLoaded('currentPaymentIntent', fn () => $this->currentPaymentIntent?->status),
            'refund_count' => $this->refunds_count,
            'auto_refund_count' => $this->auto_refunds_count,
            'report_count' => $this->reports_count,
            'interruption_report_count' => $this->interruption_reports_count,
            'consent_count' => $this->consents_count,
            'health_check_count' => $this->health_checks_count,
            'open_dispute_count' => $this->open_disputes_count,
            'flagged_message_count' => $this->flagged_messages_count,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
