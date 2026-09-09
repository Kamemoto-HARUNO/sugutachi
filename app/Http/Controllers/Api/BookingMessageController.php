<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BookingMessageResource;
use App\Models\Account;
use App\Models\Booking;
use App\Models\BookingMessage;
use App\Services\Bookings\BookingMessageTypingService;
use App\Services\DirectMessages\ParticipantPresenter;
use App\Services\DirectMessages\RelationshipPolicy;
use App\Services\Notifications\BookingNotificationService;
use App\Services\Notifications\NotificationInbox;
use App\Support\ContactExchangeDetector;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\StreamedResponse;

class BookingMessageController extends Controller
{
    public function index(
        Request $request,
        Booking $booking,
        BookingMessageTypingService $bookingMessageTypingService,
    ): AnonymousResourceCollection {
        $actor = $this->authenticatedActor($request);
        $this->authorizeMessageThreadView($booking, $actor);
        $validated = $request->validate([
            'read_status' => ['nullable', Rule::in(['read', 'unread'])],
        ]);

        $booking->loadMissing(['userAccount', 'therapistAccount', 'therapistProfile']);
        $messages = $booking->messages()
            ->with(['booking', 'sender'])
            ->when(
                $validated['read_status'] ?? null,
                fn ($query, string $readStatus) => $readStatus === 'read'
                    ? $query->whereNotNull('read_at')
                    : $query->whereNull('read_at')
            )
            ->oldest('sent_at')
            ->get();
        $messages->each(fn (BookingMessage $message) => $message->setAttribute('viewer_account_id', $actor->id));

        $unreadCount = $booking->messages()
            ->whereNull('read_at')
            ->where('sender_account_id', '!=', $actor->id)
            ->count();
        $counterpartyTyping = $bookingMessageTypingService->counterpartyTypingMeta($booking, $actor);

        return BookingMessageResource::collection($messages)->additional([
            'meta' => [
                'booking_public_id' => $booking->public_id,
                'booking_status' => $booking->status,
                'unread_count' => $unreadCount,
                'counterparty_typing' => $counterpartyTyping['is_typing'],
                'counterparty_typing_updated_at' => $counterpartyTyping['updated_at'],
                'counterparty' => $this->counterparty($booking, $actor),
                'message_thread' => $booking->messageThreadStateForRole(
                    $booking->messageParticipantRoleForAccountId($actor->id)
                ),
                'filters' => [
                    'read_status' => $validated['read_status'] ?? null,
                ],
            ],
        ]);
    }

    public function store(
        Request $request,
        Booking $booking,
        ContactExchangeDetector $detector,
        BookingMessageTypingService $bookingMessageTypingService,
        BookingNotificationService $bookingNotificationService,
    ): JsonResponse {
        $actor = $this->authenticatedActor($request);
        $this->authorizeMessageThreadWrite($booking, $actor);

        $validated = $request->validate([
            'body' => ['nullable', 'string', 'max:1000'],
            'image' => ['nullable', 'file', 'max:10240', 'mimes:jpg,jpeg,png,webp'],
        ]);
        $body = trim((string) ($validated['body'] ?? ''));
        $uploadedImage = $validated['image'] ?? null;

        if ($body === '' && ! $uploadedImage) {
            throw ValidationException::withMessages([
                'body' => 'メッセージまたは画像を選択してください。',
            ]);
        }

        if ($body !== '' && $uploadedImage) {
            throw ValidationException::withMessages([
                'image' => '画像とテキストは別々に送信してください。',
            ]);
        }

        if ($body !== '' && $detector->detects($body)) {
            return response()->json([
                'message' => 'Contact exchange is not allowed in booking messages.',
            ], 422);
        }

        $messageAttributes = [
            'sender_account_id' => $actor->id,
            'message_type' => $uploadedImage ? BookingMessage::TYPE_IMAGE : BookingMessage::TYPE_TEXT,
            'body_encrypted' => Crypt::encryptString($body),
            'detected_contact_exchange' => false,
            'moderation_status' => BookingMessage::MODERATION_STATUS_OK,
            'sent_at' => now(),
        ];

        if ($uploadedImage) {
            $path = $uploadedImage->store('booking-messages/'.$booking->public_id.'/'.$actor->public_id, 'local');

            $messageAttributes['attachment_storage_key_encrypted'] = Crypt::encryptString($path);
            $messageAttributes['attachment_original_name'] = $uploadedImage->getClientOriginalName();
            $messageAttributes['attachment_mime_type'] = $uploadedImage->getClientMimeType();
            $messageAttributes['attachment_size_bytes'] = $uploadedImage->getSize();
        }

        $message = $booking->messages()->create($messageAttributes);

        $bookingNotificationService->notifyMessageReceived($booking, $actor, $message);
        $bookingMessageTypingService->clearTyping($booking, $actor);
        $message->setAttribute('viewer_account_id', $actor->id);

        return (new BookingMessageResource($message->load(['booking', 'sender'])))
            ->response()
            ->setStatusCode(201);
    }

    public function close(
        Request $request,
        Booking $booking,
        BookingMessageTypingService $bookingMessageTypingService,
    ): JsonResponse {
        $actor = $this->authenticatedActor($request);
        $this->authorizeParticipant($booking, $actor);
        abort_unless($booking->therapist_account_id === $actor->id, 404);

        if ($booking->isMessageThreadClosed()) {
            return response()->json([
                'message' => 'このチャットはすでにクローズされています。',
            ], 409);
        }

        $booking->forceFill([
            'messages_closed_at' => now(),
            'messages_closed_by_account_id' => $actor->id,
        ])->save();

        $bookingMessageTypingService->clearForParticipants($booking);

        return response()->json([
            'data' => $booking->messageThreadStateForRole(
                $booking->messageParticipantRoleForAccountId($actor->id)
            ),
        ]);
    }

    public function showSigned(Request $request, Booking $booking, BookingMessage $message): StreamedResponse
    {
        abort_unless($request->hasValidSignature(), 403);
        abort_unless($message->booking_id === $booking->id, 404);
        abort_unless($message->attachment_storage_key_encrypted, 404);

        $viewerRole = $request->query('viewer_role');

        if ($booking->isMessageThreadClosed() && ! in_array($viewerRole, ['therapist', 'admin'], true)) {
            abort(404);
        }

        return $this->attachmentResponse($message, 'private, max-age=300');
    }

    public function destroyImage(Request $request, Booking $booking, BookingMessage $message): BookingMessageResource
    {
        $actor = $this->authenticatedActor($request);
        $this->authorizeMessageThreadWrite($booking, $actor);
        abort_unless($message->booking_id === $booking->id, 404);
        abort_unless($message->sender_account_id === $actor->id, 403);

        if ($message->message_type !== BookingMessage::TYPE_IMAGE) {
            throw ValidationException::withMessages([
                'message' => '画像メッセージのみ削除できます。',
            ]);
        }

        if ($message->attachment_storage_key_encrypted) {
            $path = Crypt::decryptString($message->attachment_storage_key_encrypted);

            if (Storage::disk('local')->exists($path)) {
                Storage::disk('local')->delete($path);
            }

            $message->forceFill([
                'attachment_storage_key_encrypted' => null,
                'attachment_original_name' => null,
                'attachment_mime_type' => null,
                'attachment_size_bytes' => null,
            ])->save();
        }

        $message = $message->refresh()->load(['booking', 'sender']);
        $message->setAttribute('viewer_account_id', $actor->id);

        return new BookingMessageResource($message);
    }

    public function typing(
        Request $request,
        Booking $booking,
        BookingMessageTypingService $bookingMessageTypingService,
    ): JsonResponse {
        $actor = $this->authenticatedActor($request);
        $this->authorizeMessageThreadWrite($booking, $actor);

        $validated = $request->validate([
            'is_typing' => ['required', 'boolean'],
        ]);

        if ($validated['is_typing']) {
            $bookingMessageTypingService->markTyping($booking, $actor);
        } else {
            $bookingMessageTypingService->clearTyping($booking, $actor);
        }

        return response()->json([
            'data' => [
                'booking_public_id' => $booking->public_id,
                'is_typing' => (bool) $validated['is_typing'],
            ],
        ]);
    }

    public function read(Request $request, Booking $booking, BookingMessage $message): BookingMessageResource
    {
        $actor = $this->authenticatedActor($request);
        $this->authorizeMessageThreadView($booking, $actor);
        abort_unless($message->booking_id === $booking->id, 404);

        DB::transaction(function () use ($booking, $actor, $message) {
            $policy = app(RelationshipPolicy::class);
            $policy->lock($booking->user_account_id, $booking->therapist_account_id);
            if (! $policy->blocked($booking->user_account_id, $booking->therapist_account_id) && ! $message->read_at && $message->sender_account_id !== $actor->id) {
                $message->forceFill(['read_at' => now()])->save();
                $role = $booking->user_account_id === $actor->id ? 'user' : 'therapist';
                app(NotificationInbox::class)->readMessage($actor->id, $role, 'booking_message_received', 'message_id', [$message->id]);
            }
        });

        $message = $message->refresh()->load(['booking', 'sender']);
        $message->setAttribute('viewer_account_id', $actor->id);

        return new BookingMessageResource($message);
    }

    private function authorizeParticipant(Booking $booking, Account $actor): void
    {
        abort_unless(
            $booking->user_account_id === $actor->id || $booking->therapist_account_id === $actor->id,
            404
        );
    }

    private function authorizeMessageThreadView(Booking $booking, Account $actor): void
    {
        $this->authorizeParticipant($booking, $actor);

        abort_unless(
            $booking->canViewMessageThreadForRole($booking->messageParticipantRoleForAccountId($actor->id)),
            404
        );
    }

    private function authorizeMessageThreadWrite(Booking $booking, Account $actor): void
    {
        $this->authorizeParticipant($booking, $actor);

        $role = $booking->messageParticipantRoleForAccountId($actor->id);

        if ($booking->isMessageThreadClosed() && $role === 'user') {
            abort(404);
        }

        if (! $booking->canSendMessagesForRole($role)) {
            abort(409, 'このチャットはクローズ済みのため新しいメッセージを送れません。');
        }
    }

    private function authenticatedActor(Request $request): Account
    {
        $bearerToken = $request->bearerToken();

        if ($bearerToken) {
            $token = PersonalAccessToken::findToken($bearerToken);

            if ($token?->tokenable instanceof Account) {
                return $token->tokenable;
            }
        }

        abort_unless($request->user() instanceof Account, 401);

        return $request->user();
    }

    private function counterparty(Booking $booking, Account $actor): ?array
    {
        $role = $booking->user_account_id === $actor->id ? 'therapist' : 'user';
        $account = $role === 'therapist' ? $booking->therapistAccount : $booking->userAccount;

        return $account ? app(ParticipantPresenter::class)->present($account, $role) : null;
    }

    private function attachmentResponse(BookingMessage $message, string $cacheControl): StreamedResponse
    {
        $path = Crypt::decryptString($message->attachment_storage_key_encrypted);

        abort_unless(Storage::disk('local')->exists($path), 404);

        return Storage::disk('local')->response($path, headers: [
            'Cache-Control' => $cacheControl,
        ]);
    }
}
