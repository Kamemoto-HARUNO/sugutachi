<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DirectMessage;
use App\Models\DirectMessageThread;
use App\Models\Report;
use App\Models\TherapistProfile;
use App\Services\DirectMessages\DirectMessageRetention;
use App\Services\DirectMessages\DirectMessageService;
use App\Services\DirectMessages\ParticipantPresenter;
use App\Services\DirectMessages\RelationshipPolicy;
use App\Services\DirectMessages\SystemNotice;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class DirectMessageController extends Controller
{
    public function __construct(private DirectMessageService $messages, private RelationshipPolicy $policy) {}

    public function index(Request $request, string $role)
    {
        $this->policy->authorizeRole($request->user(), $role);
        $v = $request->validate(['cursor' => 'nullable|string|max:500', 'filter' => 'nullable|in:all,unread,archived']);
        $query = DirectMessageThread::query()->with(['relationship.userAccount', 'relationship.therapistAccount', 'therapistProfile', 'latestMessage'])
            ->whereHas('relationship', fn ($q) => $q->where($role.'_account_id', $request->user()->id))
            ->where($role.'_archived', ($v['filter'] ?? '') === 'archived');
        if (($v['filter'] ?? '') === 'unread') {
            $query->whereHas('messages', fn ($q) => $q->where('sender_role', '!=', $role)->whereNull('read_at')->visibleContent());
        }
        $threads = $query->orderByDesc('last_message_at')->orderByDesc('id')->cursorPaginate(30);

        return response()->json(['data' => collect($threads->items())->map(fn ($t) => $this->messages->threadData($t, $role)), 'meta' => ['next_cursor' => $threads->nextCursor()?->encode(), 'enabled' => (bool) config('direct_messages.enabled')]]);
    }

    public function summary(Request $request, string $role)
    {
        $this->policy->authorizeRole($request->user(), $role);
        $count = DirectMessage::query()->where('sender_role', '!=', $role)->whereNull('read_at')->visibleContent()
            ->whereHas('thread.relationship', fn ($q) => $q->where($role.'_account_id', $request->user()->id))->count();

        return response()->json(['data' => ['unread_count' => $count, 'enabled' => (bool) config('direct_messages.enabled')]]);
    }

    public function draft(Request $request, string $role)
    {
        $this->policy->authorizeRole($request->user(), $role);
        abort_unless($role === 'user', 404);
        $v = $request->validate(['therapist_id' => 'required|string|max:36']);
        $target = TherapistProfile::query()->where('public_id', $v['therapist_id'])->firstOrFail();
        abort_if($target->account_id === $request->user()->id, 422);
        $this->policy->assertAllowed($request->user()->id, $target->account_id);
        $thread = DirectMessageThread::query()->where('therapist_profile_id', $target->id)->whereHas('relationship', fn ($q) => $q->where('user_account_id', $request->user()->id))->first();
        abort_unless($thread || (config('direct_messages.enabled') && $target->consultation_enabled && TherapistProfile::query()->publiclyViewable()->whereKey($target->id)->exists()), 404);

        return response()->json(['data' => ['thread_id' => $thread?->public_id, 'self' => app(ParticipantPresenter::class)->present($request->user(), 'user'), 'counterparty' => app(ParticipantPresenter::class)->present($target->account, 'therapist')]]);
    }

    public function store(Request $request, string $role)
    {
        return $this->send($request, $role);
    }

    public function send(Request $request, string $role, ?DirectMessageThread $thread = null)
    {
        $v = $request->validate(['target_therapist_profile_id' => $thread ? 'nullable|string' : 'required|string|max:36', 'client_message_id' => 'required|string|max:64', 'body' => 'nullable|string|max:1000', 'image' => 'nullable|file|max:10240|mimes:jpg,jpeg,png,webp']);
        [$t, $m, $created] = $this->messages->send($request->user(), $role, $v, $thread);

        return response()->json(['data' => ['thread' => $this->messages->threadData($t, $role), 'message' => $this->messages->messageData($m, $role)]], $created ? 201 : 200);
    }

    public function show(Request $request, string $role, DirectMessageThread $thread)
    {
        $this->messages->authorize($request->user(), $role, $thread);
        $v = $request->validate(['before' => 'nullable|integer|min:1', 'after' => 'nullable|integer|min:0']);
        abort_if(isset($v['before'], $v['after']), 422);
        $query = $thread->messages()->when($v['before'] ?? null, fn ($q, $id) => $q->where('id', '<', $id));
        $after = isset($v['after']);
        if ($after) {
            $query->where('id', '>', $v['after']);
        }
        $rows = $query->orderBy('id', $after ? 'asc' : 'desc')->limit(51)->get();
        $selected = $rows->take(50)->sortBy('id')->values();
        $selected->each(fn ($m) => $m->setRelation('thread', $thread));

        return response()->json(['data' => $selected->map(fn ($m) => $this->messages->messageData($m, $role)), 'meta' => ['thread' => $this->messages->threadData($thread, $role), 'has_more' => $rows->count() > 50, 'oldest_cursor' => $selected->first()?->id, 'latest_cursor' => $selected->last()?->id]]);
    }

    public function states(Request $request, string $role, DirectMessageThread $thread)
    {
        $this->messages->authorize($request->user(), $role, $thread);
        $v = $request->validate(['message_ids' => 'required|array|max:50', 'message_ids.*' => 'required|string|max:36']);

        return response()->json(['data' => $thread->messages()->whereIn('public_id', $v['message_ids'])->get()->map(function ($m) use ($thread, $role) {
            $m->setRelation('thread', $thread);

            return $this->messages->messageData($m, $role);
        })]);
    }

    public function preferences(Request $request, string $role, DirectMessageThread $thread)
    {
        $this->messages->authorize($request->user(), $role, $thread);
        $v = $request->validate(['muted' => 'sometimes|boolean', 'archived' => 'sometimes|boolean', 'paused' => 'sometimes|boolean']);
        DB::transaction(function () use ($thread, $role, $v) {
            $this->policy->lock($thread->relationship->user_account_id, $thread->relationship->therapist_account_id);
            foreach ($v as $key => $value) {
                $thread->setAttribute($role.'_'.$key, $value);
            }
            $thread->save();
            if (($v['paused'] ?? false) || ($v['muted'] ?? false)) {
                DB::table('direct_message_deliveries')->where('thread_id', $thread->id)->where('status', 'pending')
                    ->when(! ($v['paused'] ?? false), fn ($q) => $q->where('recipient_role', $role))->update(['status' => 'suppressed', 'updated_at' => now()]);
            }
        });

        return response()->json(['data' => $this->messages->threadData($thread->refresh(), $role)]);
    }

    public function read(Request $request, string $role, DirectMessageThread $thread)
    {
        $this->messages->authorize($request->user(), $role, $thread);
        $v = $request->validate(['message_ids' => 'required|array|max:50', 'message_ids.*' => 'required|string|max:36']);
        // Do not publish new read receipts after blocking.
        DB::transaction(function () use ($thread, $role, $v) {
            $this->policy->lock($thread->relationship->user_account_id, $thread->relationship->therapist_account_id);
            if (! $this->policy->blocked($thread->relationship->user_account_id, $thread->relationship->therapist_account_id)) {
                $thread->messages()->whereIn('public_id', $v['message_ids'])->where('sender_role', '!=', $role)->whereNull('read_at')->visibleContent()->update(['read_at' => now()]);
            }
        });

        return response()->json(['data' => ['ok' => true]]);
    }

    public function typing(Request $request, string $role, DirectMessageThread $thread)
    {
        $this->messages->authorize($request->user(), $role, $thread);
        $v = $request->validate(['is_typing' => 'required|boolean']);
        abort_unless($this->messages->canSend($thread), 409);
        $key = 'dm.typing.'.$thread->id.'.'.$role;
        if ($v['is_typing']) {
            Cache::put($key, true, now()->addSeconds(8));
        } else {
            Cache::forget($key);
        }

        return response()->json(['data' => ['ok' => true]]);
    }

    public function image(Request $request, string $role, DirectMessageThread $thread, DirectMessage $message)
    {
        $this->messages->authorize($request->user(), $role, $thread);
        abort_unless($message->thread_id === $thread->id, 404);
        $message->setRelation('thread', $thread);
        abort_unless($message->isVisible() && $message->attachment_key && $thread->relationship->{$message->sender_role === 'user' ? 'userAccount' : 'therapistAccount'}->status !== 'withdrawn', 404);
        abort_unless(Storage::disk('local')->exists($message->attachment_key), 404);
        $bytes = Crypt::decryptString(Storage::disk('local')->get($message->attachment_key));

        return response($bytes)->header('Content-Type', 'image/webp')->header('Cache-Control', 'private, no-store')->header('X-Content-Type-Options', 'nosniff')->header('Content-Disposition', 'inline; filename="image.webp"');
    }

    public function destroyImage(Request $request, string $role, DirectMessageThread $thread, DirectMessage $message)
    {
        $this->messages->authorize($request->user(), $role, $thread);
        abort_unless($message->thread_id === $thread->id && $message->sender_role === $role && $message->message_type === 'image', 404);
        DB::transaction(function () use ($message) {
            $message = DirectMessage::whereKey($message->id)->lockForUpdate()->firstOrFail();
            app(DirectMessageRetention::class)->erase($message);
        });

        return response()->json(['data' => $this->messages->messageData($message->refresh(), $role)]);
    }

    public function settings(Request $request, string $role)
    {
        $this->policy->authorizeRole($request->user(), $role);
        if ($request->isMethod('patch')) {
            $v = $request->validate(['consultation_enabled' => 'sometimes|boolean', 'email_enabled' => 'sometimes|boolean', 'push_enabled' => 'sometimes|boolean']);
            if (array_key_exists('consultation_enabled', $v)) {
                abort_unless($role === 'therapist' && $request->user()->therapistProfile, 422);
                $request->user()->therapistProfile->update(['consultation_enabled' => $v['consultation_enabled']]);
                unset($v['consultation_enabled']);
            }
            if ($v) {
                DB::transaction(function () use ($request, $role, $v) {
                    $request->user()->newQuery()->whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
                    DB::table('direct_message_settings')->updateOrInsert(['account_id' => $request->user()->id, 'role' => $role], [...$v, 'updated_at' => now(), 'created_at' => now()]);
                    foreach (['email', 'push'] as $channel) {
                        if (($v[$channel.'_enabled'] ?? null) === false) {
                            $threads = DirectMessageThread::whereHas('relationship', fn ($q) => $q->where($role.'_account_id', $request->user()->id))->select('id');
                            DB::table('direct_message_deliveries')->whereIn('thread_id', $threads)->where('recipient_role', $role)->where('channel', $channel)->where('status', 'pending')->update(['status' => 'suppressed', 'updated_at' => now()]);
                        }
                    }
                });
            }
        }
        $settings = DB::table('direct_message_settings')->where('account_id', $request->user()->id)->where('role', $role)->first();

        return response()->json(['data' => ['enabled' => (bool) config('direct_messages.enabled'), 'consultation_enabled' => $role === 'therapist' ? (bool) $request->user()->therapistProfile?->fresh()->consultation_enabled : null, 'email_enabled' => (bool) ($settings?->email_enabled ?? true), 'push_enabled' => (bool) ($settings?->push_enabled ?? true)]]);
    }

    public function report(Request $request, string $role, DirectMessageThread $thread)
    {
        $this->messages->authorize($request->user(), $role, $thread);
        $v = $request->validate(['message_id' => 'nullable|string|max:36', 'category' => 'required|string|max:100', 'detail' => 'required|string|max:2000']);
        $source = isset($v['message_id']) ? $thread->messages()->where('public_id', $v['message_id'])->firstOrFail() : null;
        if ($source) {
            abort_unless($source->sender_role !== $role && $source->isVisible(), 404);
        }
        $report = DB::transaction(function () use ($request, $role, $thread, $v, $source) {
            if ($source) {
                $source = DirectMessage::whereKey($source->id)->lockForUpdate()->firstOrFail();
                abort_unless($source->sender_role !== $role && $source->isVisible(), 404);
            }
            $report = Report::create(['public_id' => 'rep_'.Str::ulid(), 'reporter_account_id' => $request->user()->id, 'target_account_id' => $thread->relationship->accountId($role === 'user' ? 'therapist' : 'user'), 'reporter_role' => $role, 'direct_message_thread_id' => $thread->id, 'source_direct_message_id' => $source?->id, 'category' => $v['category'], 'detail_encrypted' => Crypt::encryptString($v['detail']), 'severity' => 'medium', 'status' => 'open', 'dm_evidence_encrypted' => $source ? Crypt::encryptString($source->body_encrypted ?? '') : null, 'evidence_review_at' => now()->addDays(90)]);
            if ($source?->attachment_key) {
                $key = 'dm-evidence/'.Str::uuid().'.enc';
                abort_unless(Storage::disk('local')->copy($source->attachment_key, $key), 500, '証拠画像の保存に失敗しました。');
                $report->update(['dm_evidence_attachment' => Crypt::encryptString($key)]);
            }
            $report->actions()->create(['action_type' => 'report_created', 'metadata_json' => ['source' => 'direct_message'], 'created_at' => now()]);
            app(SystemNotice::class)->admins('dm-report:'.$report->public_id, '新しい通報があります', '/admin/reports/'.$report->public_id);

            return $report;
        });

        return response()->json(['data' => ['public_id' => $report->public_id, 'status' => $report->status]], 201);
    }
}
