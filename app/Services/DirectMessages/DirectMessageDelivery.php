<?php

namespace App\Services\DirectMessages;

use App\Models\AppNotification;
use App\Models\DirectMessage;
use App\Models\DirectMessageThread;
use App\Services\Notifications\WebPushDeliveryService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class DirectMessageDelivery
{
    public function run(): void
    {
        if (! config('direct_messages.enabled') || ! config('direct_messages.delivery_enabled')) {
            return;
        }
        $due = DB::table('direct_message_deliveries')->where('status', 'pending')->where('due_at', '<=', now())->orderBy('id')->limit(100)->get();
        foreach ($due as $delivery) {
            $lock = Cache::lock('dm-delivery.'.$delivery->thread_id.'.'.$delivery->recipient_role.'.'.$delivery->channel, 120);
            if (! $lock->get()) {
                continue;
            }
            try {
                $this->deliver($delivery);
            } finally {
                $lock->release();
            }
        }
    }

    private function deliver(object $delivery): void
    {
        $thread = DirectMessageThread::find($delivery->thread_id);
        if (! $thread) {
            return;
        }
        DB::transaction(function () use ($thread, $delivery) {
            app(RelationshipPolicy::class)->lock($thread->relationship->user_account_id, $thread->relationship->therapist_account_id);
            $this->deliverLocked($delivery);
        });
    }

    private function deliverLocked(object $delivery): void
    {
        $delivery = DB::table('direct_message_deliveries')->where('id', $delivery->id)->where('status', 'pending')->where('due_at', '<=', now())->first();
        if (! $delivery) {
            return;
        }
        $thread = DirectMessageThread::find($delivery->thread_id);
        if (! $thread) {
            return;
        }
        $role = $delivery->recipient_role;
        $group = DB::table('direct_message_deliveries')->where('thread_id', $thread->id)->where('recipient_role', $role)->where('channel', $delivery->channel);
        $settings = DB::table('direct_message_settings')->where('account_id', $thread->relationship->accountId($role))->where('role', $role)->first();
        $messages = DirectMessage::whereIn('id', (clone $group)->where('status', 'pending')->pluck('message_id'))->whereNull('read_at')->get()->filter(fn ($m) => $m->isVisible());
        if (! app(DirectMessageService::class)->canSend($thread) || $thread->getAttribute($role.'_muted') || ! ($settings?->{$delivery->channel.'_enabled'} ?? true) || $messages->isEmpty()) {
            (clone $group)->where('status', 'pending')->update(['status' => 'suppressed', 'updated_at' => now()]);

            return;
        }
        $lastSent = (clone $group)->where('status', 'sent')->max('sent_at');
        $gap = $delivery->channel === 'email' ? 30 : 1;
        if ($lastSent && Carbon::parse($lastSent)->addMinutes($gap)->isFuture()) {
            (clone $group)->where('status', 'pending')->update(['due_at' => Carbon::parse($lastSent)->addMinutes($gap)]);

            return;
        }
        $ids = (clone $group)->where('status', 'pending')->pluck('id');
        $message = $messages->last();
        try {
            // Suppression was checked immediately before external delivery. A saved
            // message remains successful even if this later operation fails.
            if ($delivery->channel === 'email') {
                $account = $thread->relationship->{$role === 'user' ? 'userAccount' : 'therapistAccount'};
                Mail::raw('新しいメッセージがあります。'."\n\n".rtrim(config('app.url'), '/').'/'.$role.'/direct-messages/'.$thread->public_id, fn ($mail) => $mail->to($account->email)->subject('新しいメッセージがあります'));
            } else {
                $notification = AppNotification::query()->where('notification_type', 'direct_message_received')->where('data_json->direct_message_id', $message->public_id)->firstOrFail();
                app(WebPushDeliveryService::class)->deliverForNotification($notification);
            }
            DB::table('direct_message_deliveries')->whereIn('id', $ids)->update(['status' => 'sent', 'sent_at' => now(), 'updated_at' => now()]);
        } catch (\Throwable $e) {
            $attempt = $delivery->attempts + 1;
            DB::table('direct_message_deliveries')->whereIn('id', $ids)->update(['attempts' => $attempt, 'status' => $attempt >= 4 ? 'failed' : 'pending', 'due_at' => now()->addMinutes([1, 5, 30, 30][min($attempt - 1, 3)]), 'updated_at' => now()]);
            Log::warning('Direct message notification delivery failed.', ['delivery_id' => $delivery->id, 'attempt' => $attempt]);
        }
    }
}
