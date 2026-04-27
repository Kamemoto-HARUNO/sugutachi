<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BookingMessageResource;
use App\Models\Account;
use App\Models\Booking;
use App\Models\BookingMessage;
use App\Services\Bookings\BookingMessageTypingService;
use App\Support\ContactExchangeDetector;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Validation\Rule;
use Laravel\Sanctum\PersonalAccessToken;

class BookingMessageController extends Controller
{
    public function index(
        Request $request,
        Booking $booking,
        BookingMessageTypingService $bookingMessageTypingService,
    ): AnonymousResourceCollection
    {
        $actor = $this->authenticatedActor($request);
        $this->authorizeParticipant($booking, $actor);
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
    ): JsonResponse
    {
        $actor = $this->authenticatedActor($request);
        $this->authorizeParticipant($booking, $actor);

        $validated = $request->validate([
            'body' => ['required', 'string', 'min:1', 'max:1000'],
        ]);

        if ($detector->detects($validated['body'])) {
            return response()->json([
                'message' => 'Contact exchange is not allowed in booking messages.',
            ], 422);
        }

        $message = $booking->messages()->create([
            'sender_account_id' => $actor->id,
            'message_type' => 'text',
            'body_encrypted' => Crypt::encryptString($validated['body']),
            'detected_contact_exchange' => false,
            'moderation_status' => BookingMessage::MODERATION_STATUS_OK,
            'sent_at' => now(),
        ]);

        $bookingMessageTypingService->clearTyping($booking, $actor);
        $message->setAttribute('viewer_account_id', $actor->id);

        return (new BookingMessageResource($message->load(['booking', 'sender'])))
            ->response()
            ->setStatusCode(201);
    }

    public function typing(
        Request $request,
        Booking $booking,
        BookingMessageTypingService $bookingMessageTypingService,
    ): JsonResponse
    {
        $actor = $this->authenticatedActor($request);
        $this->authorizeParticipant($booking, $actor);

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
        $this->authorizeParticipant($booking, $actor);
        abort_unless($message->booking_id === $booking->id, 404);

        if (! $message->read_at && $message->sender_account_id !== $actor->id) {
            $message->forceFill(['read_at' => now()])->save();
        }

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
        if ($booking->user_account_id === $actor->id) {
            return $booking->therapistAccount
                ? [
                    'role' => 'therapist',
                    'public_id' => $booking->therapistAccount->public_id,
                    'display_name' => $booking->therapistProfile?->public_name ?? $booking->therapistAccount->display_name,
                    'account_status' => $booking->therapistAccount->status,
                    'therapist_profile_public_id' => $booking->therapistProfile?->public_id,
                ]
                : null;
        }

        if ($booking->therapist_account_id === $actor->id) {
            return $booking->userAccount
                ? [
                    'role' => 'user',
                    'public_id' => $booking->userAccount->public_id,
                    'display_name' => $booking->userAccount->display_name,
                    'account_status' => $booking->userAccount->status,
                    'therapist_profile_public_id' => null,
                ]
                : null;
        }

        return null;
    }
}
