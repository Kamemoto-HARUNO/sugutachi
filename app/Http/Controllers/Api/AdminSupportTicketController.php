<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Api\Concerns\RecordsAdminAuditLogs;
use App\Http\Controllers\Api\Concerns\ResolvesAdminFilterIds;
use App\Http\Controllers\Controller;
use App\Http\Resources\SupportTicketMessageResource;
use App\Http\Resources\SupportTicketResource;
use App\Models\Account;
use App\Models\SupportTicket;
use App\Models\SupportTicketMessage;
use App\Services\Notifications\SupportTicketNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminSupportTicketController extends Controller
{
    use AuthorizesAdminRequests;
    use RecordsAdminAuditLogs;
    use ResolvesAdminFilterIds;

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorizeAdmin($request->user());
        $validated = $request->validate([
            'account_id' => ['nullable', 'string', 'max:36'],
            'status' => ['nullable', Rule::in([SupportTicket::STATUS_OPEN, SupportTicket::STATUS_COMPLETED])],
            'category' => ['nullable', Rule::in(SupportTicket::CATEGORIES)],
            'origin' => ['nullable', Rule::in([SupportTicket::ORIGIN_USER, SupportTicket::ORIGIN_THERAPIST, SupportTicket::ORIGIN_ADMIN])],
            'read_status' => ['nullable', Rule::in(['read', 'unread'])],
            'q' => ['nullable', 'string', 'max:100'],
            'sort' => ['nullable', Rule::in(['last_message_at', 'created_at', 'category'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
        ]);
        $accountId = $this->resolveAccountId($validated['account_id'] ?? null);
        $direction = $validated['direction'] ?? 'desc';
        $sort = $validated['sort'] ?? 'last_message_at';

        $tickets = SupportTicket::query()
            ->with(['account', 'createdBy', 'completedByAdmin', 'latestMessage'])
            ->withCount(['messages as unread_count' => fn ($query) => $query
                ->where('sender_role', '!=', SupportTicketMessage::SENDER_ADMIN)
                ->whereNull('read_by_admin_at')])
            ->when($accountId, fn ($query, int $id) => $query->where('account_id', $id))
            ->when($validated['status'] ?? null, fn ($query, string $status) => $query->where('status', $status))
            ->when($validated['category'] ?? null, fn ($query, string $category) => $query->where('category', $category))
            ->when($validated['origin'] ?? null, fn ($query, string $origin) => $query->where('origin', $origin))
            ->when($validated['read_status'] ?? null, fn ($query, string $readStatus) => $query->whereHas(
                'messages',
                fn ($query) => $query
                    ->where('sender_role', '!=', SupportTicketMessage::SENDER_ADMIN)
                    ->whereNull('read_by_admin_at'),
                operator: $readStatus === 'unread' ? '>=' : '=',
                count: $readStatus === 'unread' ? 1 : 0,
            ))
            ->when($validated['q'] ?? null, fn ($query, string $term) => $query->where(function ($query) use ($term): void {
                $query
                    ->where('public_id', $term)
                    ->orWhere('title', 'like', "%{$term}%")
                    ->orWhereHas('account', fn ($query) => $query
                        ->where('public_id', $term)
                        ->orWhere('display_name', 'like', "%{$term}%")
                        ->orWhere('email', 'like', "%{$term}%"));
            }))
            ->orderByRaw("case when status = ? then 0 else 1 end", [SupportTicket::STATUS_OPEN])
            ->orderBy($sort, $direction)
            ->orderBy('id', $direction)
            ->get();

        $tickets->each(fn (SupportTicket $ticket) => $ticket->setAttribute('viewer_role', 'admin'));

        return SupportTicketResource::collection($tickets);
    }

    public function store(Request $request, SupportTicketNotificationService $notificationService): SupportTicketResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        $validated = $request->validate([
            'account_id' => ['required', 'string', 'max:36'],
            'requester_role' => ['required', Rule::in(['user', 'therapist'])],
            'title' => ['required', 'string', 'max:160'],
            'category' => ['required', Rule::in(SupportTicket::CATEGORIES)],
            'message' => ['required', 'string', 'min:2', 'max:5000'],
        ]);
        $account = Account::query()->where('public_id', $validated['account_id'])->firstOrFail();
        $this->authorizeSupportTarget($account, $validated['requester_role']);

        $ticket = DB::transaction(function () use ($admin, $account, $validated): SupportTicket {
            $ticket = SupportTicket::create([
                'public_id' => 'sup_'.Str::ulid(),
                'account_id' => $account->id,
                'requester_role' => $validated['requester_role'],
                'origin' => SupportTicket::ORIGIN_ADMIN,
                'title' => $validated['title'],
                'category' => $validated['category'],
                'status' => SupportTicket::STATUS_OPEN,
                'created_by_account_id' => $admin->id,
                'last_message_at' => now(),
            ]);
            $ticket->messages()->create([
                'sender_account_id' => $admin->id,
                'sender_role' => SupportTicketMessage::SENDER_ADMIN,
                'message_type' => SupportTicketMessage::TYPE_TEXT,
                'body_encrypted' => Crypt::encryptString(trim($validated['message'])),
                'sent_at' => now(),
                'read_by_admin_at' => now(),
            ]);

            return $ticket->fresh(['account', 'createdBy', 'completedByAdmin', 'messages.sender', 'messages.ticket', 'latestMessage']);
        });

        $message = $ticket->messages->first();
        $notificationService->notifyUserFromAdmin($ticket, $message, true);
        $this->recordAdminAudit($request, 'support_ticket.create', $ticket, [], $this->snapshot($ticket));
        $this->markViewer($ticket, 'admin', $admin->id);

        return new SupportTicketResource($ticket);
    }

    public function show(Request $request, SupportTicket $ticket): SupportTicketResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        $this->markAdminMessagesRead($ticket);

        $ticket = $ticket->fresh(['account', 'createdBy', 'completedByAdmin', 'messages.sender', 'messages.ticket', 'latestMessage']);
        $this->recordAdminAudit($request, 'support_ticket.view', $ticket, [], $this->snapshot($ticket));
        $this->markViewer($ticket, 'admin', $admin->id);

        return new SupportTicketResource($ticket);
    }

    public function message(
        Request $request,
        SupportTicket $ticket,
        SupportTicketNotificationService $notificationService,
    ): JsonResponse {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        abort_unless($ticket->isOpen(), 409, '完了済みのサポートチケットには返信できません。');

        $message = DB::transaction(function () use ($request, $ticket, $admin): SupportTicketMessage {
            $message = $this->createMessageFromRequest($request, $ticket, $admin);
            $ticket->forceFill(['last_message_at' => $message->sent_at])->save();

            return $message->load(['ticket', 'sender']);
        });

        $notificationService->notifyUserFromAdmin($ticket->refresh(), $message, false);
        $this->recordAdminAudit($request, 'support_ticket.message', $ticket, [], $this->snapshot($ticket->fresh()));
        $message->setAttribute('viewer_role', 'admin');
        $message->setAttribute('viewer_account_id', $admin->id);

        return (new SupportTicketMessageResource($message))
            ->response()
            ->setStatusCode(201);
    }

    public function complete(Request $request, SupportTicket $ticket): SupportTicketResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        abort_unless($ticket->isOpen(), 409, '完了済みのサポートチケットです。');

        $before = $this->snapshot($ticket);
        $ticket->forceFill([
            'status' => SupportTicket::STATUS_COMPLETED,
            'completed_by_admin_account_id' => $admin->id,
            'completed_at' => now(),
        ])->save();

        $ticket = $ticket->fresh(['account', 'createdBy', 'completedByAdmin', 'messages.sender', 'messages.ticket', 'latestMessage']);
        $this->recordAdminAudit($request, 'support_ticket.complete', $ticket, $before, $this->snapshot($ticket));
        $this->markViewer($ticket, 'admin', $admin->id);

        return new SupportTicketResource($ticket);
    }

    private function createMessageFromRequest(Request $request, SupportTicket $ticket, Account $admin): SupportTicketMessage
    {
        $validated = $request->validate([
            'body' => ['nullable', 'string', 'max:5000'],
            'image' => ['nullable', 'file', 'max:10240', 'mimes:jpg,jpeg,png,webp'],
        ]);
        $body = trim((string) ($validated['body'] ?? ''));
        $uploadedImage = $validated['image'] ?? null;

        if ($body === '' && ! $uploadedImage) {
            throw ValidationException::withMessages(['body' => 'メッセージまたは画像を選択してください。']);
        }

        if ($body !== '' && $uploadedImage) {
            throw ValidationException::withMessages(['image' => '画像とテキストは別々に送信してください。']);
        }

        $attributes = [
            'sender_account_id' => $admin->id,
            'sender_role' => SupportTicketMessage::SENDER_ADMIN,
            'message_type' => $uploadedImage ? SupportTicketMessage::TYPE_IMAGE : SupportTicketMessage::TYPE_TEXT,
            'body_encrypted' => $body !== '' ? Crypt::encryptString($body) : null,
            'sent_at' => now(),
            'read_by_admin_at' => now(),
        ];

        if ($uploadedImage instanceof UploadedFile) {
            $path = $uploadedImage->store('support-tickets/'.$ticket->public_id.'/'.$admin->public_id, 'local');
            $attributes['attachment_storage_key_encrypted'] = Crypt::encryptString($path);
            $attributes['attachment_original_name'] = $uploadedImage->getClientOriginalName();
            $attributes['attachment_mime_type'] = $uploadedImage->getClientMimeType();
            $attributes['attachment_size_bytes'] = $uploadedImage->getSize();
        }

        return $ticket->messages()->create($attributes);
    }

    private function markAdminMessagesRead(SupportTicket $ticket): void
    {
        $ticket->messages()
            ->where('sender_role', '!=', SupportTicketMessage::SENDER_ADMIN)
            ->whereNull('read_by_admin_at')
            ->update(['read_by_admin_at' => now(), 'updated_at' => now()]);
    }

    private function markViewer(SupportTicket $ticket, string $viewerRole, int $viewerAccountId): void
    {
        $ticket->setAttribute('viewer_role', $viewerRole);
        $ticket->messages->each(function (SupportTicketMessage $message) use ($viewerRole, $viewerAccountId): void {
            $message->setAttribute('viewer_role', $viewerRole);
            $message->setAttribute('viewer_account_id', $viewerAccountId);
        });
    }

    private function authorizeSupportTarget(Account $account, string $role): void
    {
        abort_unless($account->status === Account::STATUS_ACTIVE, 422, '対象アカウントは有効ではありません。');
        abort_unless(
            $account->roleAssignments()
                ->where('role', $role)
                ->where('status', 'active')
                ->whereNull('revoked_at')
                ->exists(),
            422,
            '対象アカウントに指定ロールがありません。'
        );
    }

    private function snapshot(SupportTicket $ticket): array
    {
        return $ticket->only([
            'id',
            'public_id',
            'account_id',
            'requester_role',
            'origin',
            'category',
            'status',
            'completed_by_admin_account_id',
            'completed_at',
            'last_message_at',
        ]);
    }
}
