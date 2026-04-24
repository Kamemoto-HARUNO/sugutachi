<?php

namespace App\Services\Notifications;

use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\Refund;
use Illuminate\Support\Facades\Crypt;

class BookingNotificationService
{
    public function notifyRequested(Booking $booking): void
    {
        $this->create(
            accountId: $booking->therapist_account_id,
            type: 'booking_requested',
            title: '新しい予約リクエスト',
            body: $booking->is_on_demand
                ? '新しい予約リクエストが届きました。'
                : '新しい予定予約リクエストが届きました。',
            data: [
                'booking_public_id' => $booking->public_id,
                'request_type' => $booking->is_on_demand ? 'on_demand' : 'scheduled',
                'requested_start_at' => $booking->requested_start_at?->toJSON(),
                'request_expires_at' => $booking->request_expires_at?->toJSON(),
            ],
        );
    }

    public function notifyAccepted(Booking $booking): void
    {
        $this->create(
            accountId: $booking->user_account_id,
            type: 'booking_accepted',
            title: '予約が承諾されました',
            body: '予約リクエストが承諾されました。',
            data: [
                'booking_public_id' => $booking->public_id,
                'request_type' => $booking->is_on_demand ? 'on_demand' : 'scheduled',
                'scheduled_start_at' => $booking->scheduled_start_at?->toJSON(),
                'buffer_before_minutes' => $booking->buffer_before_minutes,
                'buffer_after_minutes' => $booking->buffer_after_minutes,
            ],
        );
    }

    public function notifyCanceled(
        Booking $booking,
        ?int $recipientAccountId = null,
        ?string $reasonCode = null,
        ?string $reasonNote = null,
    ): void {
        $reasonCode ??= (string) ($booking->cancel_reason_code ?? '');
        $reasonNote ??= $booking->cancel_reason_note_encrypted
            ? rescue(fn () => Crypt::decryptString($booking->cancel_reason_note_encrypted), null, false)
            : null;
        $canceledByRole = $this->canceledByRole($booking);

        $this->create(
            accountId: $recipientAccountId ?? $this->cancellationRecipientId($booking),
            type: 'booking_canceled',
            title: '予約がキャンセルされました',
            body: $this->cancellationBody(
                reasonCode: $reasonCode,
                canceledByRole: $canceledByRole,
                reasonNote: $reasonNote,
            ),
            data: [
                'booking_public_id' => $booking->public_id,
                'reason_code' => $reasonCode,
                'reason_note' => $reasonNote,
                'canceled_by_role' => $canceledByRole,
            ],
        );
    }

    public function notifyRefunded(Refund $refund): void
    {
        $refund->loadMissing('booking');

        if (! $refund->booking) {
            return;
        }

        $this->create(
            accountId: $refund->booking->user_account_id,
            type: 'booking_refunded',
            title: '返金が更新されました',
            body: $refund->status === Refund::STATUS_PROCESSED
                ? '返金が処理されました。'
                : '返金リクエストが承認されました。',
            data: [
                'booking_public_id' => $refund->booking->public_id,
                'refund_public_id' => $refund->public_id,
                'reason_code' => $refund->reason_code,
                'refund_status' => $refund->status,
                'requested_amount' => $refund->requested_amount,
                'approved_amount' => $refund->approved_amount,
                'is_auto' => $refund->reason_code === Refund::REASON_CODE_BOOKING_CANCELLATION_AUTO,
            ],
        );
    }

    public function notifyInterrupted(
        Booking $booking,
        string $responsibility,
        string $interruptedByRole,
        ?string $reasonCode = null,
        ?string $reasonNote = null,
        ?int $recipientAccountId = null,
    ): void {
        $reasonCode ??= (string) ($booking->cancel_reason_code ?? '');
        $reasonNote ??= $booking->cancel_reason_note_encrypted
            ? rescue(fn () => Crypt::decryptString($booking->cancel_reason_note_encrypted), null, false)
            : null;

        $this->create(
            accountId: $recipientAccountId ?? ($interruptedByRole === 'user'
                ? $booking->therapist_account_id
                : $booking->user_account_id),
            type: 'booking_interrupted',
            title: '施術が中断されました',
            body: $this->interruptionBody($responsibility, $reasonNote),
            data: [
                'booking_public_id' => $booking->public_id,
                'reason_code' => $reasonCode,
                'reason_note' => $reasonNote,
                'responsibility' => $responsibility,
                'interrupted_by_role' => $interruptedByRole,
            ],
        );
    }

    private function create(int $accountId, string $type, string $title, string $body, array $data): void
    {
        AppNotification::create([
            'account_id' => $accountId,
            'notification_type' => $type,
            'channel' => 'in_app',
            'title' => $title,
            'body' => $body,
            'data_json' => $data,
            'status' => 'sent',
            'sent_at' => now(),
        ]);
    }

    private function cancellationRecipientId(Booking $booking): int
    {
        return match ($this->canceledByRole($booking)) {
            'user' => $booking->therapist_account_id,
            default => $booking->user_account_id,
        };
    }

    private function canceledByRole(Booking $booking): string
    {
        return match ($booking->canceled_by_account_id) {
            $booking->user_account_id => 'user',
            $booking->therapist_account_id => 'therapist',
            default => 'system',
        };
    }

    private function cancellationBody(string $reasonCode, string $canceledByRole, ?string $reasonNote): string
    {
        return match ($reasonCode) {
            'therapist_rejected' => '予約リクエストが見送られました。',
            'payment_intent_canceled' => '決済処理が完了しなかったため予約がキャンセルされました。',
            'request_expired' => '承諾期限を過ぎたため予約リクエストが失効しました。',
            default => $canceledByRole === 'user'
                ? 'ユーザー都合で予約がキャンセルされました。'
                : ($canceledByRole === 'therapist'
                    ? trim("セラピスト都合で予約がキャンセルされました。 {$reasonNote}")
                    : '予約がキャンセルされました。'),
        };
    }

    private function interruptionBody(string $responsibility, ?string $reasonNote): string
    {
        $base = match ($responsibility) {
            'user' => 'ユーザー都合で施術が中断されました。',
            'therapist' => 'セラピスト都合で施術が中断されました。',
            'force_majeure' => '不可抗力のため施術が中断されました。',
            'shared' => '双方確認のうえ施術が中断されました。',
            default => '施術が中断されました。',
        };

        return $reasonNote ? "{$base} {$reasonNote}" : $base;
    }
}
