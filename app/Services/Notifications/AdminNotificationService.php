<?php

namespace App\Services\Notifications;

use App\Models\Account;
use App\Models\AppNotification;
use App\Models\ContactInquiry;
use App\Models\IdentityVerification;
use App\Models\PayoutRequest;
use App\Models\Refund;
use App\Models\Report;

class AdminNotificationService
{
    public function notifyIdentityVerificationSubmitted(IdentityVerification $verification): void
    {
        $verification->loadMissing('account');

        $this->broadcast(
            type: 'identity_verification_submitted',
            title: '本人確認・年齢確認の提出があります',
            body: '新しい本人確認・年齢確認の提出がありました。審査一覧を確認してください。',
            data: [
                'verification_id' => $verification->id,
                'account_public_id' => $verification->account?->public_id,
                'submitted_at' => $verification->submitted_at?->toIso8601String(),
                'target_role' => 'admin',
                'target_path' => '/admin/identity-verifications',
            ],
        );
    }

    public function notifyContactInquiryReceived(ContactInquiry $inquiry): void
    {
        $this->broadcast(
            type: 'contact_inquiry_received',
            title: '新しいお問い合わせがあります',
            body: '新しいお問い合わせが届きました。内容を確認してください。',
            data: [
                'contact_inquiry_public_id' => $inquiry->public_id,
                'category' => $inquiry->category,
                'source' => $inquiry->source,
                'target_role' => 'admin',
                'target_path' => "/admin/contact-inquiries/{$inquiry->public_id}",
            ],
        );
    }

    public function notifyRefundRequested(Refund $refund): void
    {
        $refund->loadMissing(['booking', 'requestedBy']);

        $this->broadcast(
            type: 'refund_requested',
            title: '新しい返金申請があります',
            body: '利用者から返金申請が届きました。内容と金額を確認してください。',
            data: [
                'refund_public_id' => $refund->public_id,
                'booking_public_id' => $refund->booking?->public_id,
                'requested_by_account_id' => $refund->requestedBy?->public_id,
                'requested_amount' => $refund->requested_amount,
                'reason_code' => $refund->reason_code,
                'target_role' => 'admin',
                'target_path' => '/admin/refund-requests',
            ],
        );
    }

    public function notifyPayoutRequested(PayoutRequest $payoutRequest): void
    {
        $payoutRequest->loadMissing('therapistAccount');

        $this->broadcast(
            type: 'payout_requested',
            title: '新しい出金申請があります',
            body: 'セラピストから出金申請が届きました。振込内容を確認してください。',
            data: [
                'payout_request_public_id' => $payoutRequest->public_id,
                'therapist_account_id' => $payoutRequest->therapistAccount?->public_id,
                'requested_amount' => $payoutRequest->requested_amount,
                'scheduled_process_date' => $payoutRequest->scheduled_process_date?->toDateString(),
                'target_role' => 'admin',
                'target_path' => '/admin/payout-requests',
            ],
        );
    }

    public function notifyReportCreated(Report $report): void
    {
        $report->loadMissing(['booking', 'reporter', 'target']);

        $this->broadcast(
            type: 'report_created',
            title: '新しい通報があります',
            body: '利用者またはセラピストから通報が届きました。状況を確認してください。',
            data: [
                'report_public_id' => $report->public_id,
                'booking_public_id' => $report->booking?->public_id,
                'reporter_account_id' => $report->reporter?->public_id,
                'target_account_id' => $report->target?->public_id,
                'category' => $report->category,
                'severity' => $report->severity,
                'target_role' => 'admin',
                'target_path' => "/admin/reports/{$report->public_id}",
            ],
        );
    }

    private function broadcast(string $type, string $title, string $body, array $data): void
    {
        $adminIds = Account::query()
            ->where('status', Account::STATUS_ACTIVE)
            ->whereHas('roleAssignments', fn ($query) => $query
                ->where('role', 'admin')
                ->where('status', 'active'))
            ->pluck('id');

        foreach ($adminIds as $adminId) {
            AppNotification::create([
                'account_id' => $adminId,
                'notification_type' => $type,
                'channel' => 'in_app',
                'title' => $title,
                'body' => $body,
                'data_json' => $data,
                'status' => AppNotification::STATUS_SENT,
                'sent_at' => now(),
            ]);
        }
    }
}
