<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BookingMessageResource;
use App\Models\Account;
use App\Models\Booking;
use App\Models\BookingMessage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Crypt;

class BookingMessageController extends Controller
{
    public function index(Request $request, Booking $booking): AnonymousResourceCollection
    {
        $this->authorizeParticipant($booking, $request->user());

        return BookingMessageResource::collection(
            $booking->messages()
                ->with(['booking', 'sender'])
                ->oldest('sent_at')
                ->get()
        );
    }

    public function store(Request $request, Booking $booking): JsonResponse
    {
        $this->authorizeParticipant($booking, $request->user());

        $validated = $request->validate([
            'body' => ['required', 'string', 'min:1', 'max:1000'],
        ]);

        if ($this->detectContactExchange($validated['body'])) {
            return response()->json([
                'message' => 'Contact exchange is not allowed in booking messages.',
            ], 422);
        }

        $message = $booking->messages()->create([
            'sender_account_id' => $request->user()->id,
            'message_type' => 'text',
            'body_encrypted' => Crypt::encryptString($validated['body']),
            'detected_contact_exchange' => false,
            'moderation_status' => 'ok',
            'sent_at' => now(),
        ]);

        return (new BookingMessageResource($message->load(['booking', 'sender'])))
            ->response()
            ->setStatusCode(201);
    }

    public function read(Request $request, Booking $booking, BookingMessage $message): BookingMessageResource
    {
        $this->authorizeParticipant($booking, $request->user());
        abort_unless($message->booking_id === $booking->id, 404);

        if (! $message->read_at) {
            $message->forceFill(['read_at' => now()])->save();
        }

        return new BookingMessageResource($message->refresh()->load(['booking', 'sender']));
    }

    private function authorizeParticipant(Booking $booking, Account $actor): void
    {
        abort_unless(
            $booking->user_account_id === $actor->id || $booking->therapist_account_id === $actor->id,
            404
        );
    }

    private function detectContactExchange(string $body): bool
    {
        return preg_match('/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i', $body) === 1
            || preg_match('/(?:\+?\d[\d\s\-().]{8,}\d)/', $body) === 1
            || preg_match('/\b(?:line|kakao|wechat|telegram|instagram|twitter|x)\s*[:：@]/i', $body) === 1
            || preg_match('/(?:paypay|paypal|venmo|cash\s*app|銀行振込|口座)/iu', $body) === 1;
    }
}
