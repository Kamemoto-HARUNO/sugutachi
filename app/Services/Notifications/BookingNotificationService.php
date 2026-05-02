<?php

namespace App\Services\Notifications;

use App\Models\AppNotification;
use App\Models\Account;
use App\Models\Booking;
use App\Models\BookingMessage;
use App\Models\Refund;
use Illuminate\Support\Facades\Crypt;

class BookingNotificationService
{
    public function notifyRequested(Booking $booking): void
    {
        $booking->loadMissing(['userAccount', 'therapistAccount', 'therapistProfile']);

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
                'target_path' => $this->therapistRequestPath($booking),
            ],
        );
    }

    public function notifyAccepted(Booking $booking): void
    {
        $booking->loadMissing(['userAccount', 'therapistAccount', 'therapistProfile']);

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
                'target_path' => $this->userBookingPath($booking),
            ],
        );
    }

    public function notifyTherapistConfirmed(Booking $booking): void
    {
        $booking->loadMissing(['therapistAccount', 'therapistProfile']);

        $body = $this->buildTherapistConfirmedBody($booking);

        $this->create(
            accountId: $booking->therapist_account_id,
            type: 'booking_confirmed',
            title: '予約が確定しました',
            body: $body,
            data: [
                'booking_public_id' => $booking->public_id,
                'request_type' => $booking->is_on_demand ? 'on_demand' : 'scheduled',
                'scheduled_start_at' => $booking->scheduled_start_at?->toJSON(),
                'target_path' => $this->therapistBookingPath($booking),
            ],
        );
    }

    public function notifyAdjustmentProposed(Booking $booking): void
    {
        $booking->loadMissing(['userAccount', 'therapistAccount', 'therapistProfile']);

        $this->create(
            accountId: $booking->user_account_id,
            type: 'booking_adjustment_proposed',
            title: '時間変更の提案が届きました',
            body: 'タチキャストから開始時間または終了時間の調整提案が届いています。内容を確認してください。',
            data: [
                'booking_public_id' => $booking->public_id,
                'status' => $booking->status,
                'proposed_start_at' => $booking->therapist_adjustment_start_at?->toJSON(),
                'proposed_end_at' => $booking->therapist_adjustment_end_at?->toJSON(),
                'proposed_total_amount' => $booking->therapist_adjustment_total_amount,
                'target_path' => $this->userBookingPath($booking),
            ],
        );
    }

    public function notifyAdjustmentAccepted(Booking $booking): void
    {
        $booking->loadMissing(['therapistAccount', 'therapistProfile']);

        $this->create(
            accountId: $booking->therapist_account_id,
            type: 'booking_adjustment_accepted',
            title: '利用者が時間変更を承認しました',
            body: '提案した時間で予約が確定しました。',
            data: [
                'booking_public_id' => $booking->public_id,
                'status' => $booking->status,
                'scheduled_start_at' => $booking->scheduled_start_at?->toJSON(),
                'scheduled_end_at' => $booking->scheduled_end_at?->toJSON(),
                'target_path' => $this->therapistBookingPath($booking),
            ],
        );
    }

    public function notifyTherapistStartReminder(Booking $booking, string $stage, int $travelMinutes): void
    {
        $booking->loadMissing(['therapistAccount', 'therapistProfile']);

        $title = match ($stage) {
            'pre_departure' => '予約準備の時間が近づいています',
            'departure' => 'そろそろ出発の時間です',
            default => '予約リマインド',
        };
        $body = $this->buildTherapistStartReminderBody($booking, $stage, $travelMinutes);

        $this->create(
            accountId: $booking->therapist_account_id,
            type: 'booking_start_reminder',
            title: $title,
            body: $body,
            data: [
                'booking_public_id' => $booking->public_id,
                'status' => $booking->status,
                'scheduled_start_at' => $booking->scheduled_start_at?->toJSON(),
                'walking_time_minutes' => $travelMinutes,
                'reminder_stage' => $stage,
                'target_path' => $this->therapistBookingPath($booking),
            ],
        );
    }

    public function notifyNoShowReported(Booking $booking): void
    {
        $booking->loadMissing(['userAccount', 'therapistAccount', 'therapistProfile']);

        $this->create(
            accountId: $booking->user_account_id,
            type: 'booking_no_show_reported',
            title: '未着申告の確認が必要です',
            body: 'タチキャストから「利用者と会えなかった」という申告が届いています。請求はまだ確定していません。内容を確認してください。',
            data: [
                'booking_public_id' => $booking->public_id,
                'status' => $booking->status,
                'reported_at' => $booking->pending_no_show_reported_at?->toJSON(),
                'reason_code' => $booking->pending_no_show_reason_code,
                'target_path' => $this->userBookingPath($booking),
            ],
        );
    }

    public function notifyNoShowConfirmed(Booking $booking): void
    {
        $booking->loadMissing(['therapistAccount', 'therapistProfile']);

        $this->create(
            accountId: $booking->therapist_account_id,
            type: 'booking_no_show_confirmed',
            title: '利用者が未着を認めました',
            body: '利用者が未着申告を確認しました。予約は中断となり、キャンセル料を反映しています。',
            data: [
                'booking_public_id' => $booking->public_id,
                'status' => $booking->status,
                'target_path' => $this->therapistBookingPath($booking),
            ],
        );
    }

    public function notifyNoShowDisputed(Booking $booking): void
    {
        $booking->loadMissing(['therapistAccount', 'therapistProfile']);

        $this->create(
            accountId: $booking->therapist_account_id,
            type: 'booking_no_show_disputed',
            title: '利用者が未着申告に異議を申し立てました',
            body: '利用者が「現地にいた」と回答しました。予約は中断し、請求は確定していません。必要に応じて運営対応をご確認ください。',
            data: [
                'booking_public_id' => $booking->public_id,
                'status' => $booking->status,
                'target_path' => $this->therapistBookingPath($booking),
            ],
        );
    }

    public function notifyMoving(Booking $booking): void
    {
        $booking->loadMissing(['userAccount', 'therapistAccount', 'therapistProfile']);

        $this->create(
            accountId: $booking->user_account_id,
            type: 'booking_moving',
            title: 'タチキャストが向かっています',
            body: 'タチキャストが移動を開始しました。到着時はアプリに表示される4桁コードをお伝えください。',
            data: [
                'booking_public_id' => $booking->public_id,
                'status' => $booking->status,
                'arrival_confirmation_code_generated_at' => $booking->arrival_confirmation_code_generated_at?->toJSON(),
                'target_path' => $this->userBookingPath($booking),
            ],
        );
    }

    public function notifyArrived(Booking $booking): void
    {
        $booking->loadMissing(['userAccount', 'therapistAccount', 'therapistProfile']);

        $this->create(
            accountId: $booking->user_account_id,
            type: 'booking_arrived',
            title: 'タチキャストが到着しました',
            body: 'タチキャストが到着しました。合流後の案内をご確認ください。',
            data: [
                'booking_public_id' => $booking->public_id,
                'status' => $booking->status,
                'target_path' => $this->userBookingPath($booking),
            ],
        );
    }

    public function notifyStarted(Booking $booking): void
    {
        $booking->loadMissing(['userAccount', 'therapistAccount', 'therapistProfile']);

        $this->create(
            accountId: $booking->user_account_id,
            type: 'booking_started',
            title: '対応が開始されました',
            body: 'タチキャストが対応開始を記録しました。',
            data: [
                'booking_public_id' => $booking->public_id,
                'status' => $booking->status,
                'target_path' => $this->userBookingPath($booking),
            ],
        );
    }

    public function notifyTherapistCompleted(Booking $booking): void
    {
        $booking->loadMissing(['userAccount', 'therapistAccount', 'therapistProfile']);

        $this->create(
            accountId: $booking->user_account_id,
            type: 'booking_therapist_completed',
            title: '対応終了の確認をお願いします',
            body: 'タチキャストが対応終了を記録しました。レビュー送信または完了確認をお願いします。',
            data: [
                'booking_public_id' => $booking->public_id,
                'status' => $booking->status,
                'ended_at' => $booking->ended_at?->toJSON(),
                'target_path' => $this->userBookingPath($booking),
            ],
        );
    }

    public function notifyCompletionWindowUpdated(Booking $booking): void
    {
        $booking->loadMissing(['userAccount', 'therapistAccount', 'therapistProfile']);

        $this->create(
            accountId: $booking->user_account_id,
            type: 'booking_completion_window_updated',
            title: '対応時間が更新されました',
            body: 'タチキャストが開始時刻または終了時刻を更新しました。最終金額をご確認ください。',
            data: [
                'booking_public_id' => $booking->public_id,
                'status' => $booking->status,
                'started_at' => $booking->started_at?->toJSON(),
                'ended_at' => $booking->ended_at?->toJSON(),
                'actual_duration_minutes' => $booking->actual_duration_minutes,
                'total_amount' => $booking->total_amount,
                'target_path' => $this->userBookingPath($booking),
            ],
        );
    }

    public function notifyCompletionReminder(Booking $booking): void
    {
        $booking->loadMissing(['userAccount', 'therapistAccount', 'therapistProfile']);

        $this->create(
            accountId: $booking->user_account_id,
            type: 'booking_completion_reminder',
            title: '対応終了の確認がまだです',
            body: '対応終了の確認がまだ完了していません。レビュー送信または完了確認をお願いします。',
            data: [
                'booking_public_id' => $booking->public_id,
                'status' => $booking->status,
                'target_path' => $this->userBookingPath($booking),
            ],
        );
    }

    public function notifyAutoCompleted(Booking $booking): void
    {
        $booking->loadMissing(['userAccount', 'therapistAccount', 'therapistProfile']);

        $this->create(
            accountId: $booking->user_account_id,
            type: 'booking_auto_completed',
            title: '予約が自動で完了になりました',
            body: '一定時間経過したため、この予約は自動で完了になりました。',
            data: [
                'booking_public_id' => $booking->public_id,
                'status' => $booking->status,
                'completed_at' => $booking->completed_at?->toJSON(),
                'target_path' => $this->userBookingPath($booking),
            ],
        );

        $this->create(
            accountId: $booking->therapist_account_id,
            type: 'booking_auto_completed',
            title: '予約が自動で完了になりました',
            body: '利用者確認がなかったため、この予約は自動で完了になりました。',
            data: [
                'booking_public_id' => $booking->public_id,
                'status' => $booking->status,
                'completed_at' => $booking->completed_at?->toJSON(),
                'target_path' => $this->therapistBookingPath($booking),
            ],
        );
    }

    public function notifyCanceled(
        Booking $booking,
        ?int $recipientAccountId = null,
        ?string $reasonCode = null,
        ?string $reasonNote = null,
    ): void {
        $booking->loadMissing(['userAccount', 'therapistAccount', 'therapistProfile']);

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
                'target_path' => ($recipientAccountId ?? $this->cancellationRecipientId($booking)) === $booking->therapist_account_id
                    ? $this->therapistBookingPath($booking)
                    : $this->userBookingPath($booking),
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
                'target_path' => $this->userBookingPath($refund->booking),
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
        $booking->loadMissing(['userAccount', 'therapistAccount', 'therapistProfile']);

        $reasonCode ??= (string) ($booking->cancel_reason_code ?? '');
        $reasonNote ??= $booking->cancel_reason_note_encrypted
            ? rescue(fn () => Crypt::decryptString($booking->cancel_reason_note_encrypted), null, false)
            : null;

        $this->create(
            accountId: $recipientAccountId ?? ($interruptedByRole === 'user'
                ? $booking->therapist_account_id
                : $booking->user_account_id),
            type: 'booking_interrupted',
            title: '対応が中断されました',
            body: $this->interruptionBody($responsibility, $reasonNote),
            data: [
                'booking_public_id' => $booking->public_id,
                'reason_code' => $reasonCode,
                'reason_note' => $reasonNote,
                'responsibility' => $responsibility,
                'interrupted_by_role' => $interruptedByRole,
                'target_path' => ($recipientAccountId ?? ($interruptedByRole === 'user'
                    ? $booking->therapist_account_id
                    : $booking->user_account_id)) === $booking->therapist_account_id
                        ? $this->therapistBookingPath($booking)
                        : $this->userBookingPath($booking),
            ],
        );
    }

    public function notifyMessageReceived(Booking $booking, Account $sender, BookingMessage $message): void
    {
        $booking->loadMissing(['userAccount', 'therapistAccount', 'therapistProfile']);

        [$recipientAccountId, $targetPath, $targetRole, $senderRole] = match ($sender->id) {
            $booking->user_account_id => [
                $booking->therapist_account_id,
                $this->therapistBookingMessagesPath($booking),
                'therapist',
                'user',
            ],
            $booking->therapist_account_id => [
                $booking->user_account_id,
                $this->userBookingMessagesPath($booking),
                'user',
                'therapist',
            ],
            default => [null, null, null, null],
        };

        if ($recipientAccountId === null || $targetPath === null || $senderRole === null || $targetRole === null) {
            return;
        }

        $title = '新しいメッセージが届きました';
        $body = $this->messageReceivedBody($senderRole, $message->message_type);

        $this->create(
            accountId: $recipientAccountId,
            type: 'booking_message_received',
            title: $title,
            body: $body,
            data: [
                'booking_public_id' => $booking->public_id,
                'message_id' => $message->id,
                'message_type' => $message->message_type,
                'sender_role' => $senderRole,
                'target_role' => $targetRole,
                'target_path' => $targetPath,
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

    private function therapistRequestPath(Booking $booking): string
    {
        return "/therapist/requests/{$booking->public_id}";
    }

    private function therapistBookingPath(Booking $booking): string
    {
        return "/therapist/bookings/{$booking->public_id}";
    }

    private function therapistBookingMessagesPath(Booking $booking): string
    {
        return "/therapist/bookings/{$booking->public_id}/messages";
    }

    private function userBookingPath(Booking $booking): string
    {
        return "/user/bookings/{$booking->public_id}";
    }

    private function userBookingMessagesPath(Booking $booking): string
    {
        return "/user/bookings/{$booking->public_id}/messages";
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
                    ? trim("タチキャスト都合で予約がキャンセルされました。 {$reasonNote}")
                    : '予約がキャンセルされました。'),
        };
    }

    private function interruptionBody(string $responsibility, ?string $reasonNote): string
    {
        $base = match ($responsibility) {
            'user' => 'ユーザー都合で対応が中断されました。',
            'therapist' => 'タチキャスト都合で対応が中断されました。',
            'force_majeure' => '不可抗力のため対応が中断されました。',
            'shared' => '双方確認のうえ対応が中断されました。',
            default => '対応が中断されました。',
        };

        return $reasonNote ? "{$base} {$reasonNote}" : $base;
    }

    private function messageReceivedBody(string $senderRole, string $messageType): string
    {
        $senderLabel = $senderRole === 'therapist' ? 'タチキャスト' : '利用者';
        $messageLabel = $messageType === BookingMessage::TYPE_IMAGE ? '画像' : 'メッセージ';

        return "{$senderLabel}から{$messageLabel}が届きました。";
    }

    private function buildTherapistConfirmedBody(Booking $booking): string
    {
        $scheduledStartLabel = $this->scheduledStartLabel($booking);

        if ($scheduledStartLabel === null) {
            return '予約が確定しました。';
        }

        return "{$scheduledStartLabel} 開始予定の予約が確定しました。";
    }

    private function buildTherapistStartReminderBody(Booking $booking, string $stage, int $travelMinutes): string
    {
        $scheduledStartLabel = $this->scheduledStartLabel($booking);

        $body = match ($stage) {
            'pre_departure' => $travelMinutes > 0
                ? "移動時間目安は{$travelMinutes}分です。そろそろ移動準備を始める時間です。"
                : '予約開始の1時間前です。そろそろ準備を始める時間です。',
            'departure' => $travelMinutes > 0
                ? "移動時間目安は{$travelMinutes}分です。そろそろ出発の時間です。"
                : '予約開始の時間が近づいています。',
            default => '予約開始前のリマインドです。',
        };

        return $scheduledStartLabel === null
            ? $body
            : "{$scheduledStartLabel} 開始予定の予約です。 {$body}";
    }

    private function scheduledStartLabel(Booking $booking): ?string
    {
        return $booking->scheduled_start_at?->copy()->timezone('Asia/Tokyo')->format('n月j日 G:i');
    }
}
