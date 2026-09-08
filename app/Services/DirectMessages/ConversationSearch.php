<?php

namespace App\Services\DirectMessages;

use App\Models\BookingMessage;
use App\Models\DirectMessage;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Crypt;

class ConversationSearch
{
    /** Search only an already authorized, role/filter-scoped inbox, before pagination. */
    public function directMessages(Builder $threads, string $role, string $term): array
    {
        $matches = [];
        $counterRole = $role === 'user' ? 'therapist' : 'user';
        $relation = $counterRole === 'user' ? 'userAccount' : 'therapistAccount';
        foreach ((clone $threads)->setEagerLoads([])->with('relationship.'.$relation.'.therapistProfile')->lazyById(200) as $thread) {
            $name = app(ParticipantPresenter::class)->displayName($thread->relationship->{$relation}, $counterRole);
            if (mb_stripos($name, $term) !== false) {
                $matches[$thread->id] = null;
            }
        }

        // Bodies stay encrypted at rest. Decrypt in bounded batches on the server;
        // never expose another role's history or keep a plaintext search index.
        $messages = DirectMessage::query()->visibleContent()->whereNotNull('body_encrypted')
            ->whereIn('thread_id', (clone $threads)->select('direct_message_threads.id'));
        foreach ($messages->lazyByIdDesc(200) as $message) {
            if (isset($matches[$message->thread_id])) {
                continue;
            }
            $excerpt = $this->excerpt($message->body_encrypted ?? '', $term);
            if ($excerpt !== null) {
                $matches[$message->thread_id] = $excerpt;
            }
        }

        return $matches;
    }

    public function bookings(Collection $bookings, int $accountId, string $term): Collection
    {
        $visible = $bookings->filter(fn ($b) => $b->canViewMessageThreadForRole($b->messageParticipantRoleForAccountId($accountId)));
        $matches = [];
        foreach ($visible as $booking) {
            $role = $booking->messageParticipantRoleForAccountId($accountId) === 'user' ? 'therapist' : 'user';
            $name = app(ParticipantPresenter::class)->displayName($role === 'user' ? $booking->userAccount : $booking->therapistAccount, $role);
            if (mb_stripos($name, $term) !== false) {
                $matches[$booking->id] = null;
            }
        }
        foreach (BookingMessage::query()->whereIn('booking_id', $visible->modelKeys())->where(fn ($q) => $q->where('message_type', '!=', 'image')->orWhereNotNull('attachment_storage_key_encrypted'))->lazyByIdDesc(200) as $message) {
            if (isset($matches[$message->booking_id])) {
                continue;
            }
            $body = rescue(fn () => Crypt::decryptString($message->body_encrypted), '', false);
            $excerpt = $this->excerpt($body, $term);
            if ($excerpt !== null) {
                $matches[$message->booking_id] = $excerpt;
            }
        }

        return $visible->filter(fn ($b) => array_key_exists($b->id, $matches))
            ->each(fn ($b) => $b->setAttribute('search_preview', $matches[$b->id]))->values();
    }

    private function excerpt(string $body, string $term): ?string
    {
        $position = mb_stripos($body, $term);
        if ($position === false) {
            return null;
        }
        $start = max(0, $position - 8);
        $length = max(100, mb_strlen($term) + 40);

        return ($start > 0 ? '…' : '').mb_substr($body, $start, $length)
            .(mb_strlen($body) > $start + $length ? '…' : '');
    }
}
