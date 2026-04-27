<?php

namespace App\Services\Bookings;

use App\Models\Account;
use App\Models\Booking;
use Illuminate\Support\Facades\Cache;

class BookingMessageTypingService
{
    private const TTL_SECONDS = 8;

    public function markTyping(Booking $booking, Account $actor): void
    {
        Cache::put(
            $this->cacheKey($booking, $actor),
            ['updated_at' => now()->toIso8601String()],
            now()->addSeconds(self::TTL_SECONDS),
        );
    }

    public function clearTyping(Booking $booking, Account $actor): void
    {
        Cache::forget($this->cacheKey($booking, $actor));
    }

    public function counterpartyTypingMeta(Booking $booking, Account $actor): array
    {
        $counterpartyId = $booking->user_account_id === $actor->id
            ? $booking->therapist_account_id
            : ($booking->therapist_account_id === $actor->id ? $booking->user_account_id : null);

        if (! $counterpartyId) {
            return [
                'is_typing' => false,
                'updated_at' => null,
            ];
        }

        $payload = Cache::get($this->cacheKeyForAccount($booking, $counterpartyId));

        return [
            'is_typing' => is_array($payload),
            'updated_at' => is_array($payload) ? ($payload['updated_at'] ?? null) : null,
        ];
    }

    private function cacheKey(Booking $booking, Account $actor): string
    {
        return $this->cacheKeyForAccount($booking, $actor->id);
    }

    private function cacheKeyForAccount(Booking $booking, int $accountId): string
    {
        return "booking:{$booking->id}:typing:{$accountId}";
    }
}
