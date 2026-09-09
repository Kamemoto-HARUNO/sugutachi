<?php

namespace App\Services\DirectMessages;

use App\Models\Account;
use App\Models\AppNotification;
use App\Models\DirectMessage;
use App\Models\DirectMessageThread;
use App\Models\TherapistProfile;
use App\Support\ContactExchangeDetector;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class DirectMessageService
{
    public function __construct(private RelationshipPolicy $policy, private MessageImages $images, private ParticipantPresenter $presenter) {}

    public function authorize(Account $actor, string $role, DirectMessageThread $thread): void
    {
        $this->policy->authorizeRole($actor, $role);
        abort_unless($thread->relationship->accountId($role) === $actor->id, 404);
    }

    public function canSend(DirectMessageThread $thread): bool
    {
        $r = $thread->relationship;

        return config('direct_messages.enabled') && config('direct_messages.sending_enabled')
            && ! $thread->user_paused && ! $thread->therapist_paused
            && $r->userAccount?->status === Account::STATUS_ACTIVE && $r->therapistAccount?->status === Account::STATUS_ACTIVE
            && $r->userAccount->roleAssignments()->where('role', 'user')->where('status', 'active')->whereNull('revoked_at')->exists()
            && $r->therapistAccount->roleAssignments()->where('role', 'therapist')->where('status', 'active')->whereNull('revoked_at')->exists()
            && $thread->therapistProfile?->profile_status !== TherapistProfile::STATUS_SUSPENDED
            && ! $this->policy->blocked($r->user_account_id, $r->therapist_account_id);
    }

    public function send(Account $actor, string $role, array $input, ?DirectMessageThread $existing = null): array
    {
        $this->policy->authorizeRole($actor, $role);
        abort_unless(config('direct_messages.enabled') && config('direct_messages.sending_enabled'), 409, 'DMの送信を現在停止しています。');
        if ($existing) {
            $this->authorize($actor, $role, $existing);
        }
        abort_unless($existing || $role === 'user', 404);
        $target = $existing?->therapistProfile ?? TherapistProfile::query()->where('public_id', $input['target_therapist_profile_id'])->firstOrFail();
        $userId = $existing?->relationship->user_account_id ?? $actor->id;
        abort_if($userId === $target->account_id, 422, '自分には送信できません。');
        $body = trim((string) ($input['body'] ?? ''));
        $file = $input['image'] ?? null;
        if (($body === '' && ! $file) || ($body !== '' && $file)) {
            throw ValidationException::withMessages(['body' => '文章か画像のどちらかを送信してください。']);
        }
        if ($body && app(ContactExchangeDetector::class)->detects($body)) {
            throw ValidationException::withMessages(['body' => '外部の連絡先は送信できません。']);
        }
        $hash = hash('sha256', $file ? 'image:'.hash_file('sha256', $file->getRealPath()) : 'text:'.$body);
        $attachment = [];
        try {
            return DB::transaction(function () use ($actor, $role, $input, $target, $userId, $body, $file, $hash, &$attachment) {
                $relationship = $this->policy->lock($userId, $target->account_id);
                $this->policy->assertAllowed($userId, $target->account_id);
                $thread = DirectMessageThread::query()->where('relationship_id', $relationship->id)->first();
                if ($thread) {
                    $prior = $thread->messages()->where('sender_role', $role)->where('client_message_id', $input['client_message_id'])->first();
                    if ($prior) {
                        abort_unless(hash_equals($prior->content_hash, $hash), 409, '同じ送信キーで内容を変更できません。');

                        return [$thread, $prior, false];
                    }
                } else {
                    abort_unless($target->fresh()->consultation_enabled && TherapistProfile::query()->publiclyViewable()->whereKey($target->id)->exists(), 409, '現在この相手への相談・予約はできません。');
                    abort_unless(filled($actor->display_name), 422, '利用者としての表示名を設定してください。');
                    $newContacts = DirectMessageThread::query()->whereHas('relationship', fn ($q) => $q->where('user_account_id', $userId))->where('created_at', '>', now()->subDay())->count();
                    abort_if($newContacts >= config('direct_messages.new_contacts_per_day'), 429, '新しい相手への相談は24時間に5人までです。');
                    $userProfile = $actor->userProfile()->firstOrCreate(['account_id' => $actor->id]);
                    $thread = DirectMessageThread::create(['public_id' => 'dmt_'.Str::ulid(), 'relationship_id' => $relationship->id, 'user_profile_id' => $userProfile->id, 'therapist_profile_id' => $target->id]);
                }
                abort_unless($this->canSend($thread), 409, '現在このDMには送信できません。');
                if ($role === 'user' && ! $thread->first_reply_at) {
                    abort_if($thread->messages()->where('sender_role', 'user')->count() >= config('direct_messages.before_reply_limit'), 429, '相手の返信をお待ちください。');
                }
                $minuteCount = DirectMessage::query()->where('sent_at', '>', now()->subMinute())->where(function ($q) use ($actor) {
                    foreach (['user', 'therapist'] as $r) {
                        $q->orWhere(fn ($q) => $q->where('sender_role', $r)->whereHas('thread.relationship', fn ($q) => $q->where($r.'_account_id', $actor->id)));
                    }
                })->count();
                abort_if($minuteCount >= config('direct_messages.messages_per_minute'), 429, '少し時間をおいて送信してください。');
                if ($file) {
                    $attachment = $this->images->store($file);
                }
                $message = $thread->messages()->create(['public_id' => 'dmm_'.Str::ulid(), 'sender_role' => $role, 'client_message_id' => $input['client_message_id'], 'content_hash' => $hash, 'message_type' => $file ? 'image' : 'text', 'body_encrypted' => $body, 'sent_at' => now(), 'expires_at' => now()->addDays(config('direct_messages.retention_days')), ...$attachment]);
                $thread->update(['last_message_at' => now(), 'first_reply_at' => $thread->first_reply_at ?? ($role === 'therapist' ? now() : null)]);
                Cache::forget('dm.typing.'.$thread->id.'.'.$role);
                $recipient = $role === 'user' ? 'therapist' : 'user';
                AppNotification::create(['account_id' => $relationship->accountId($recipient), 'channel' => 'in_app', 'notification_type' => 'direct_message_received', 'title' => '新しいメッセージがあります', 'body' => '新しいメッセージがあります。', 'status' => AppNotification::STATUS_SENT, 'sent_at' => now(), 'data_json' => ['target_role' => $recipient, 'target_path' => '/'.$recipient.'/direct-messages/'.$thread->public_id, 'direct_message_id' => $message->public_id]]);
                foreach (['push' => 1, 'email' => 5] as $channel => $minutes) {
                    DB::table('direct_message_deliveries')->insert(['thread_id' => $thread->id, 'message_id' => $message->id, 'recipient_role' => $recipient, 'channel' => $channel, 'status' => 'pending', 'due_at' => now()->addMinutes($minutes), 'created_at' => now(), 'updated_at' => now()]);
                }

                return [$thread, $message, true];
            });
        } catch (\Throwable $e) {
            if ($attachment) {
                $this->images->remove($attachment['attachment_key']);
            }
            throw $e;
        }
    }

    public function messageData(DirectMessage $message, string $role): array
    {
        $visible = $message->isVisible();
        $sender = $message->thread->relationship->{$message->sender_role === 'user' ? 'userAccount' : 'therapistAccount'};

        return ['public_id' => $message->public_id, 'cursor' => $message->id, 'sender_role' => $message->sender_role, 'is_own' => $message->sender_role === $role, 'message_type' => $message->message_type, 'body' => $visible ? $message->body_encrypted : null, 'is_deleted' => ! $visible, 'image_url' => $visible && $message->attachment_key && $sender?->status !== Account::STATUS_WITHDRAWN ? '/api/'.$role.'/direct-messages/'.$message->thread->public_id.'/messages/'.$message->public_id.'/image' : null, 'is_read' => (bool) $message->read_at, 'sent_at' => $message->sent_at, 'expires_at' => $message->expires_at];
    }

    public function threadData(DirectMessageThread $thread, string $role): array
    {
        $other = $role === 'user' ? 'therapist' : 'user';
        $r = $thread->relationship;
        $last = $thread->latestMessage;

        return ['public_id' => $thread->public_id, 'role' => $role,
            'self' => $this->presenter->present($r->{$role === 'user' ? 'userAccount' : 'therapistAccount'}, $role),
            'counterparty' => $this->presenter->present($r->{$other === 'user' ? 'userAccount' : 'therapistAccount'}, $other),
            'relationship_id' => $r->public_id, 'can_send' => $this->canSend($thread),
            'blocked_by_me' => (bool) $r->getAttribute($role.'_blocked_at'),
            'preferences' => ['muted' => $thread->getAttribute($role.'_muted'), 'archived' => $thread->getAttribute($role.'_archived'), 'paused' => $thread->getAttribute($role.'_paused')],
            'last_message_at' => $thread->last_message_at, 'first_reply_at' => $thread->first_reply_at,
            'unread_count' => $thread->messages()->where('sender_role', $other)->whereNull('read_at')->visibleContent()->count(),
            'preview' => $last && $last->isVisible() ? ($last->message_type === 'image' ? '画像' : Str::limit($last->body_encrypted, 60)) : null,
            'typing' => $this->canSend($thread) && Cache::has('dm.typing.'.$thread->id.'.'.$other),
        ];
    }
}
