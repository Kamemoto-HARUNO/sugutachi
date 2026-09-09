<?php

namespace App\Services\DirectMessages;

use App\Models\AppNotification;
use App\Services\Notifications\WebPushDeliveryService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

class SystemNoticeDelivery
{
    public function run(): void
    {
        if (! config('direct_messages.delivery_enabled')) {
            return;
        }
        foreach (DB::table('dm_system_deliveries')->where('status', 'pending')->where('due_at', '<=', now())->orderBy('id')->limit(100)->get() as $item) {
            $lock = Cache::lock('dm-system-delivery.'.$item->id, 120);
            if (! $lock->get()) {
                continue;
            }
            try {
                $current = DB::table('dm_system_deliveries')->where('id', $item->id)->where('status', 'pending')->where('due_at', '<=', now())->first();
                if (! $current) {
                    continue;
                }
                $item = $current;
                $notice = AppNotification::findOrFail($item->notification_id);
                if ($notice->account->status !== 'active') {
                    DB::table('dm_system_deliveries')->where('id', $item->id)->update(['status' => 'suppressed']);

                    continue;
                }
                if ($item->channel === 'email') {
                    Mail::raw($notice->body."\n\n".rtrim(config('app.url'), '/').$notice->data_json['target_path'], fn ($mail) => $mail->to($notice->account->email)->subject($notice->title));
                } else {
                    app(WebPushDeliveryService::class)->deliverForNotification($notice);
                }
                DB::table('dm_system_deliveries')->where('id', $item->id)->update(['status' => 'sent']);
            } catch (\Throwable $e) {
                $attempt = $item->attempts + 1;
                DB::table('dm_system_deliveries')->where('id', $item->id)->update(['attempts' => $attempt, 'status' => $attempt >= 4 ? 'failed' : 'pending', 'due_at' => now()->addMinutes([1, 5, 30, 30][min($attempt - 1, 3)])]);
            } finally {
                $lock->release();
            }
        }
    }
}
