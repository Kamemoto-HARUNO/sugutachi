<?php

namespace App\Http\Controllers\Api;

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
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class SupportTicketController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $account = $this->supportAccount($request);
        $validated = $request->validate([
            'status' => ['nullable', Rule::in([SupportTicket::STATUS_OPEN, SupportTicket::STATUS_COMPLETED])],
            'category' => ['nullable', Rule::in(SupportTicket::CATEGORIES)],
            'read_status' => ['nullable', Rule::in(['read', 'unread'])],
            'q' => ['nullable', 'string', 'max:100'],
            'sort' => ['nullable', Rule::in(['last_message_at', 'created_at', 'category'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
        ]);
        $direction = $validated['direction'] ?? 'desc';
        $sort = $validated['sort'] ?? 'last_message_at';

        $tickets = SupportTicket::query()
            ->where('account_id', $account->id)
            ->with(['account', 'createdBy', 'latestMessage'])
            ->withCount(['messages as unread_count' => fn ($query) => $query
                ->where('sender_role', SupportTicketMessage::SENDER_ADMIN)
                ->whereNull('read_by_user_at')])
            ->when($validated['status'] ?? null, fn ($query, string $status) => $query->where('status', $status))
            ->when($validated['category'] ?? null, fn ($query, string $category) => $query->where('category', $category))
            ->when($validated['read_status'] ?? null, fn ($query, string $readStatus) => $query->whereHas(
                'messages',
                fn ($query) => $query
                    ->where('sender_role', SupportTicketMessage::SENDER_ADMIN)
                    ->whereNull('read_by_user_at'),
                operator: $readStatus === 'unread' ? '>=' : '=',
                count: $readStatus === 'unread' ? 1 : 0,
            ))
            ->when($validated['q'] ?? null, fn ($query, string $term) => $query->where(function ($query) use ($term): void {
                $query
                    ->where('public_id', $term)
                    ->orWhere('title', 'like', "%{$term}%");
            }))
            ->orderByRaw('case when status = ? then 0 else 1 end', [SupportTicket::STATUS_OPEN])
            ->orderBy($sort, $direction)
            ->orderBy('id', $direction)
            ->get();

        $tickets->each(fn (SupportTicket $ticket) => $ticket->setAttribute('viewer_role', $ticket->requester_role));

        return SupportTicketResource::collection($tickets);
    }

    public function store(Request $request, SupportTicketNotificationService $notificationService): SupportTicketResource
    {
        $account = $this->supportAccount($request);
        $validated = $request->validate([
            'requester_role' => ['sometimes', Rule::in(['user', 'therapist'])],
            'title' => ['required', 'string', 'max:160'],
            'category' => ['required', Rule::in(SupportTicket::CATEGORIES)],
            'message' => ['required', 'string', 'min:2', 'max:5000'],
        ]);

        $requesterRole = $validated['requester_role'] ?? $this->supportRole($account);
        abort_unless($account->roleAssignments()->where('role', $requesterRole)->where('status', 'active')->whereNull('revoked_at')->exists(), 403);

        $ticket = DB::transaction(function () use ($account, $requesterRole, $validated): SupportTicket {
            $ticket = SupportTicket::create([
                'public_id' => 'sup_'.Str::ulid(),
                'account_id' => $account->id,
                'requester_role' => $requesterRole,
                'origin' => $requesterRole,
                'title' => $validated['title'],
                'category' => $validated['category'],
                'status' => SupportTicket::STATUS_OPEN,
                'created_by_account_id' => $account->id,
                'last_message_at' => now(),
            ]);

            $ticket->messages()->create([
                'sender_account_id' => $account->id,
                'sender_role' => $requesterRole,
                'message_type' => SupportTicketMessage::TYPE_TEXT,
                'body_encrypted' => Crypt::encryptString(trim($validated['message'])),
                'sent_at' => now(),
                'read_by_user_at' => now(),
            ]);

            return $ticket->fresh(['messages.sender', 'messages.ticket', 'account', 'createdBy']);
        });

        $message = $ticket->messages->first();
        $notificationService->notifyAdminsFromUser($ticket, $message, true);
        $this->markViewer($ticket, $requesterRole, $account->id);

        return new SupportTicketResource($ticket);
    }

    public function show(Request $request, SupportTicket $ticket): SupportTicketResource
    {
        $account = $this->supportAccount($request);
        abort_unless($ticket->account_id === $account->id, 404);

        $this->markUserMessagesRead($ticket);
        $ticket = $ticket->fresh(['account', 'createdBy', 'messages.sender', 'messages.ticket', 'latestMessage']);
        $this->markViewer($ticket, $ticket->requester_role, $account->id);

        return new SupportTicketResource($ticket);
    }

    public function message(
        Request $request,
        SupportTicket $ticket,
        SupportTicketNotificationService $notificationService,
    ): JsonResponse {
        $account = $this->supportAccount($request);
        abort_unless($ticket->account_id === $account->id, 404);
        abort_unless($ticket->isOpen(), 409, '完了済みのサポートチケットには返信できません。');

        $requesterRole = $ticket->requester_role;
        $message = DB::transaction(function () use ($request, $ticket, $account, $requesterRole): SupportTicketMessage {
            $message = $this->createMessageFromRequest($request, $ticket, $account, $requesterRole);
            $ticket->forceFill(['last_message_at' => $message->sent_at])->save();

            return $message->load(['ticket', 'sender']);
        });

        $notificationService->notifyAdminsFromUser($ticket->refresh(), $message, false);
        $message->setAttribute('viewer_account_id', $account->id);
        $message->setAttribute('viewer_role', $requesterRole);

        return (new SupportTicketMessageResource($message))
            ->response()
            ->setStatusCode(201);
    }

    public function showSigned(Request $request, SupportTicket $ticket, SupportTicketMessage $message): StreamedResponse
    {
        abort_unless($request->hasValidSignature(), 403);
        abort_unless($message->support_ticket_id === $ticket->id, 404);
        abort_unless($message->attachment_storage_key_encrypted, 404);

        $path = Crypt::decryptString($message->attachment_storage_key_encrypted);
        abort_unless(Storage::disk('local')->exists($path), 404);

        return Storage::disk('local')->response($path, headers: [
            'Cache-Control' => 'private, max-age=300',
        ]);
    }

    private function createMessageFromRequest(Request $request, SupportTicket $ticket, Account $sender, string $senderRole): SupportTicketMessage
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
            'sender_account_id' => $sender->id,
            'sender_role' => $senderRole,
            'message_type' => $uploadedImage ? SupportTicketMessage::TYPE_IMAGE : SupportTicketMessage::TYPE_TEXT,
            'body_encrypted' => $body !== '' ? Crypt::encryptString($body) : null,
            'sent_at' => now(),
            'read_by_user_at' => $senderRole === SupportTicketMessage::SENDER_ADMIN ? null : now(),
            'read_by_admin_at' => $senderRole === SupportTicketMessage::SENDER_ADMIN ? now() : null,
        ];

        if ($uploadedImage instanceof UploadedFile) {
            $path = $uploadedImage->store('support-tickets/'.$ticket->public_id.'/'.$sender->public_id, 'local');
            $attributes['attachment_storage_key_encrypted'] = Crypt::encryptString($path);
            $attributes['attachment_original_name'] = $uploadedImage->getClientOriginalName();
            $attributes['attachment_mime_type'] = $uploadedImage->getClientMimeType();
            $attributes['attachment_size_bytes'] = $uploadedImage->getSize();
        }

        return $ticket->messages()->create($attributes);
    }

    private function markUserMessagesRead(SupportTicket $ticket): void
    {
        $ticket->messages()
            ->where('sender_role', SupportTicketMessage::SENDER_ADMIN)
            ->whereNull('read_by_user_at')
            ->update(['read_by_user_at' => now(), 'updated_at' => now()]);
    }

    private function markViewer(SupportTicket $ticket, string $viewerRole, int $viewerAccountId): void
    {
        $ticket->setAttribute('viewer_role', $viewerRole);
        $ticket->messages->each(function (SupportTicketMessage $message) use ($viewerRole, $viewerAccountId): void {
            $message->setAttribute('viewer_role', $viewerRole);
            $message->setAttribute('viewer_account_id', $viewerAccountId);
        });
    }

    private function supportAccount(Request $request): Account
    {
        abort_unless($request->user() instanceof Account, 401);

        $account = $request->user();
        abort_unless($this->supportRole($account) !== null, 403);

        return $account;
    }

    private function supportRole(Account $account): ?string
    {
        $activeRoles = $account->roleAssignments()
            ->whereIn('role', ['user', 'therapist'])
            ->where('status', 'active')
            ->whereNull('revoked_at')
            ->pluck('role')
            ->all();

        if (in_array($account->last_active_role, $activeRoles, true)) {
            return $account->last_active_role;
        }

        return $activeRoles[0] ?? null;
    }
}
