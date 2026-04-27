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
            'request_type' => $this->is_on_demand ? 'on_demand' : 'scheduled',
            'is_on_demand' => $this->is_on_demand,
            'availability_slot_id' => $this->currentQuote?->input_snapshot_json['availability_slot_id']
                ?? $this->whenLoaded('availabilitySlot', fn () => $this->availabilitySlot?->public_id),
            'requested_start_at' => $this->requested_start_at,
            'scheduled_start_at' => $this->scheduled_start_at,
            'scheduled_end_at' => $this->scheduled_end_at,
            'duration_minutes' => $this->duration_minutes,
            'actual_duration_minutes' => $this->actual_duration_minutes,
            'buffer_before_minutes' => $this->buffer_before_minutes,
            'buffer_after_minutes' => $this->buffer_after_minutes,
            'request_expires_at' => $this->request_expires_at,
            'pending_adjustment_proposal' => $this->hasPendingTherapistAdjustment()
                ? [
                    'proposed_at' => $this->therapist_adjustment_proposed_at,
                    'scheduled_start_at' => $this->therapist_adjustment_start_at,
                    'scheduled_end_at' => $this->therapist_adjustment_end_at,
                    'duration_minutes' => $this->therapist_adjustment_duration_minutes,
                    'total_amount' => $this->therapist_adjustment_total_amount,
                    'therapist_net_amount' => $this->therapist_adjustment_therapist_net_amount,
                    'platform_fee_amount' => $this->therapist_adjustment_platform_fee_amount,
                    'matching_fee_amount' => $this->therapist_adjustment_matching_fee_amount,
                    'buffer_before_minutes' => $this->therapist_adjustment_buffer_before_minutes,
                    'buffer_after_minutes' => $this->therapist_adjustment_buffer_after_minutes,
                ]
                : null,
            'pending_no_show_report' => $this->hasPendingNoShowReport()
                ? [
                    'reported_at' => $this->pending_no_show_reported_at,
                    'reported_by_role' => $this->pendingNoShowReportedByRole(),
                    'reason_code' => $this->pending_no_show_reason_code,
                    'reason_note' => $this->pending_no_show_note_encrypted
                        ? rescue(fn () => Crypt::decryptString($this->pending_no_show_note_encrypted), null, false)
                        : null,
                ]
                : null,
            'accepted_at' => $this->accepted_at,
            'confirmed_at' => $this->confirmed_at,
            'moving_at' => $this->moving_at,
            'arrived_at' => $this->arrived_at,
            'arrival_confirmation_code' => $this->when(
                $request->user()?->id === $this->user_account_id,
                fn () => $this->arrival_confirmation_code,
            ),
            'arrival_confirmation_code_generated_at' => $this->when(
                $request->user()?->id === $this->user_account_id,
                fn () => $this->arrival_confirmation_code_generated_at,
            ),
            'started_at' => $this->started_at,
            'ended_at' => $this->ended_at,
            'service_completion_reported_at' => $this->service_completion_reported_at,
            'completed_at' => $this->completed_at,
            'canceled_at' => $this->canceled_at,
            'interrupted_at' => $this->interrupted_at,
            'cancel_reason_code' => $this->cancel_reason_code,
            'interruption_reason_code' => $this->interruption_reason_code,
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
            'settlement_total_amount' => $this->settlement_total_amount,
            'settlement_therapist_net_amount' => $this->settlement_therapist_net_amount,
            'settlement_platform_fee_amount' => $this->settlement_platform_fee_amount,
            'settlement_matching_fee_amount' => $this->settlement_matching_fee_amount,
            'uncaptured_extension_amount' => $this->uncaptured_extension_amount,
            'counterparty' => $this->counterparty($request),
            'therapist_profile' => $this->whenLoaded('therapistProfile', fn () => $this->therapistProfile ? [
                'public_id' => $this->therapistProfile->public_id,
                'public_name' => $this->therapistProfile->public_name,
            ] : null),
            'therapist_menu' => $this->whenLoaded('therapistMenu', fn () => $this->therapistMenu ? [
                'public_id' => $this->therapistMenu->public_id,
                'name' => $this->therapistMenu->name,
                'duration_minutes' => $this->therapistMenu->duration_minutes,
                'minimum_duration_minutes' => $this->therapistMenu->minimum_duration_minutes,
                'duration_step_minutes' => $this->therapistMenu->duration_step_minutes,
                'base_price_amount' => $this->therapistMenu->base_price_amount,
                'hourly_rate_amount' => $this->therapistMenu->hourly_rate_amount,
            ] : null),
            'service_address' => $this->whenLoaded('serviceAddress', fn () => $this->serviceAddress
                ? new ServiceAddressResource($this->serviceAddress)
                : null),
            'current_quote' => $this->whenLoaded('currentQuote', fn () => new BookingQuoteResource($this->currentQuote)),
            'current_payment_intent' => $this->whenLoaded('currentPaymentIntent', fn () => $this->currentPaymentIntent
                ? new PaymentIntentResource($this->currentPaymentIntent)
                : null),
            'refund_breakdown' => $this->whenLoaded('refunds', fn () => $this->refundBreakdown()),
            'refunds' => $this->whenLoaded('refunds', fn () => BookingRefundResource::collection($this->refunds)),
            'consents' => $this->whenLoaded('consents', fn () => BookingConsentResource::collection($this->consents)),
            'health_checks' => $this->whenLoaded('healthChecks', fn () => BookingHealthCheckResource::collection($this->healthChecks)),
            'unread_message_count' => $this->when(isset($this->unread_message_count), fn () => $this->unread_message_count),
            'refund_count' => $this->when(isset($this->refunds_count), fn () => $this->refunds_count),
            'open_report_count' => $this->when(isset($this->open_report_count), fn () => $this->open_report_count),
            'latest_message_sent_at' => $this->when(isset($this->latest_message_sent_at), fn () => $this->latest_message_sent_at),
            'created_at' => $this->created_at,
        ];
    }

    private function counterparty(Request $request): ?array
    {
        $viewer = $request->user();

        if (! $viewer) {
            return null;
        }

        if ($viewer->id === $this->user_account_id) {
            if (! $this->relationLoaded('therapistAccount') || ! $this->therapistAccount) {
                return null;
            }

            return [
                'role' => 'therapist',
                'public_id' => $this->therapistAccount->public_id,
                'display_name' => $this->therapistProfile?->public_name ?? $this->therapistAccount->display_name,
                'account_status' => $this->therapistAccount->status,
                'therapist_profile_public_id' => $this->therapistProfile?->public_id,
            ];
        }

        if ($viewer->id === $this->therapist_account_id) {
            if (! $this->relationLoaded('userAccount') || ! $this->userAccount) {
                return null;
            }

            return [
                'role' => 'user',
                'public_id' => $this->userAccount->public_id,
                'display_name' => $this->userAccount->display_name,
                'account_status' => $this->userAccount->status,
                'therapist_profile_public_id' => null,
                'user_profile' => $this->counterpartyUserProfile(),
            ];
        }

        return null;
    }

    private function counterpartyUserProfile(): ?array
    {
        if (! $this->relationLoaded('userAccount') || ! $this->userAccount || ! $this->userAccount->relationLoaded('userProfile')) {
            return null;
        }

        $profile = $this->userAccount->userProfile;

        if (! $profile) {
            return null;
        }

        $canDiscloseSensitiveProfile = $profile->disclose_sensitive_profile_to_therapist;
        $latestIdentityVerification = $this->userAccount->relationLoaded('latestIdentityVerification')
            ? $this->userAccount->latestIdentityVerification
            : null;

        return [
            'profile_status' => $profile->profile_status,
            'identity_verified' => $latestIdentityVerification?->status === 'approved',
            'age_verified' => (bool) $latestIdentityVerification?->is_age_verified,
            'age_range' => $profile->age_range,
            'body_type' => $profile->body_type,
            'height_cm' => $profile->height_cm,
            'weight_range' => $profile->weight_range,
            'disclose_sensitive_profile_to_therapist' => $canDiscloseSensitiveProfile,
            'preferences' => $canDiscloseSensitiveProfile ? $profile->preferences_json : null,
            'touch_ng' => $canDiscloseSensitiveProfile ? $profile->touch_ng_json : null,
            'health_notes' => $canDiscloseSensitiveProfile && $profile->health_notes_encrypted
                ? rescue(fn () => Crypt::decryptString($profile->health_notes_encrypted), null, false)
                : null,
            'sexual_orientation' => $canDiscloseSensitiveProfile ? $profile->sexual_orientation : null,
            'gender_identity' => $canDiscloseSensitiveProfile ? $profile->gender_identity : null,
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
