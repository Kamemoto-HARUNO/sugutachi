<?php

namespace App\Services\Notifications;

use App\Models\Account;
use App\Models\AppNotification;
use App\Models\SupportTicket;
use App\Models\SupportTicketMessage;

class SupportTicketNotificationService
{
    public function __construct(
        private readonly AdminSlackNotificationService $slackNotificationService,
    ) {}

    public function notifyUserFromAdmin(SupportTicket $ticket, SupportTicketMessage $message, bool $isNewTicket = false): void
    {
        $ticket->loadMissing('account');

        AppNotification::create([
            'account_id' => $ticket->account_id,
            'notification_type' => $isNewTicket ? 'support_ticket_created' : 'support_ticket_message_received',
            'channel' => 'in_app',
            'title' => $isNewTicket ? '運営からサポートチケットが届きました' : 'サポートセンターに返信が届きました',
            'body' => $isNewTicket
                ? '運営からサポートセンターに新しいチケットが届きました。内容をご確認ください。'
                : 'サポートセンターに運営から新しい返信が届きました。内容をご確認ください。',
            'data_json' => [
                'support_ticket_public_id' => $ticket->public_id,
                'support_ticket_message_id' => $message->id,
                'category' => $ticket->category,
                'target_role' => $ticket->requester_role,
                'target_path' => "/help/tickets/{$ticket->public_id}",
            ],
            'status' => AppNotification::STATUS_SENT,
            'sent_at' => now(),
        ]);
    }

    public function notifyAdminsFromUser(SupportTicket $ticket, SupportTicketMessage $message, bool $isNewTicket = false): void
    {
        $type = $isNewTicket ? 'support_ticket_created' : 'support_ticket_message_received';
        $title = $isNewTicket ? '新しいサポートチケットがあります' : 'サポートチケットに新着返信があります';
        $body = $isNewTicket
            ? '会員から新しいサポートチケットが届きました。管理画面で内容を確認してください。'
            : '会員からサポートチケットへの返信が届きました。管理画面で内容を確認してください。';
        $data = [
            'support_ticket_public_id' => $ticket->public_id,
            'support_ticket_message_id' => $message->id,
            'category' => $ticket->category,
            'target_role' => 'admin',
            'target_path' => "/admin/support-tickets/{$ticket->public_id}",
        ];

        $adminIds = Account::query()
            ->where('status', Account::STATUS_ACTIVE)
            ->whereHas('roleAssignments', fn ($query) => $query
                ->where('role', 'admin')
                ->where('status', 'active')
                ->whereNull('revoked_at'))
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

        $this->slackNotificationService->send(
            type: $type,
            title: $title,
            body: $body,
            data: $data,
        );
    }
}
