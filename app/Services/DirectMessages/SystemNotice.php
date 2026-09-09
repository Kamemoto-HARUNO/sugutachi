<?php

namespace App\Services\DirectMessages;

use App\Models\Account;
use App\Models\AppNotification;
use App\Models\Booking;
use Illuminate\Support\Facades\DB;

class SystemNotice
{
    public function create(int $accountId, string $role, string $key, string $title, string $body, string $path): void
    {
        if (AppNotification::where('account_id', $accountId)->where('data_json->notice_key', $key)->exists()) {
            return;
        }
        $notification = AppNotification::withoutEvents(fn () => AppNotification::create([
            'account_id' => $accountId, 'notification_type' => 'dm_system_notice', 'channel' => 'in_app',
            'title' => $title, 'body' => $body, 'status' => 'sent', 'sent_at' => now(),
            'data_json' => ['notice_key' => $key, 'target_role' => $role, 'target_path' => $path],
        ]));
        foreach (['email', 'push'] as $channel) {
            DB::table('dm_system_deliveries')->insert(['notification_id' => $notification->id, 'channel' => $channel, 'due_at' => now()]);
        }
    }

    public function admins(string $key, string $title, string $path): void
    {
        foreach (Account::where('status', 'active')->whereHas('roleAssignments', fn ($q) => $q->where('role', 'admin')->where('status', 'active'))->pluck('id') as $id) {
            $this->create($id, 'admin', $key, $title, '管理画面で内容を確認してください。', $path);
        }
    }

    public function booking(Booking $booking, string $state, ?string $event = null): void
    {
        $body = match ($state) {
            'pending' => '予約をキャンセルしました。利用者負担は0円です。決済の取消・返金を処理しています。',
            'complete' => '決済の取消・返金処理が完了しました。明細への反映時期は決済会社により異なります。',
            default => '運営が予約と精算を確認しています。チャットの送信は停止しています。',
        };
        foreach (['user', 'therapist'] as $role) {
            $this->create($booking->{$role.'_account_id'}, $role, 'block:'.$booking->public_id.':'.$state.':'.$role.($event ? ':'.$event : ''), '予約についてのお知らせ', $body, '/'.$role.'/bookings/'.$booking->public_id);
        }
        if ($state === 'review') {
            $this->admins('block-review:'.$booking->public_id.($event ? ':'.$event : ''), '予約の精算確認が必要です', '/admin/message-operations');
        }
    }
}
