<?php

namespace App\Services\Favorites;

use App\Models\AppNotification;
use App\Models\FavoriteEventLog;
use App\Models\TherapistAvailabilitySlot;
use App\Models\TherapistFavorite;
use App\Models\TherapistProfile;
use Illuminate\Database\Eloquent\Builder;

class TherapistFavoriteNotificationService
{
    public function notifyFavoriteAdded(TherapistFavorite $favorite): void
    {
        $favorite->loadMissing('therapistProfile');

        $this->createNotification(
            accountId: $favorite->therapist_account_id,
            type: 'therapist_favorite_added',
            title: 'お気に入りが増えました',
            body: 'あなたをお気に入りに追加した利用者がいます。',
            data: [
                'therapist_profile_public_id' => $favorite->therapistProfile?->public_id,
                'target_path' => '/therapist/favorites',
            ],
        );

        $this->log($favorite, 'favorite_added');
    }

    public function notifyOnline(TherapistProfile $profile): void
    {
        $profile->loadMissing('account');

        $favorites = $this->eligibleFavorites($profile)
            ->where(function (Builder $query): void {
                $query
                    ->whereNull('last_online_notified_at')
                    ->orWhere('last_online_notified_at', '<=', now()->subMinutes(TherapistFavorite::ONLINE_NOTIFICATION_COOLDOWN_MINUTES));
            })
            ->whereHas('userAccount.userProfile', fn (Builder $query) => $query->where('favorite_notify_online', true))
            ->get();

        foreach ($favorites as $favorite) {
            $this->createNotification(
                accountId: $favorite->user_account_id,
                type: 'favorite_therapist_online',
                title: "{$profile->public_name} さんがオンラインになりました",
                body: 'お気に入りのタチキャストがオンライン受付を開始しました。',
                data: [
                    'therapist_profile_public_id' => $profile->public_id,
                    'target_path' => "/therapists/{$profile->public_id}",
                ],
            );

            $favorite->forceFill(['last_online_notified_at' => now()])->save();
            $this->log($favorite, 'favorite_online_notified');
        }
    }

    public function notifyAvailability(TherapistAvailabilitySlot $slot): int
    {
        if ($slot->status !== TherapistAvailabilitySlot::STATUS_PUBLISHED) {
            return 0;
        }

        $slot->loadMissing('therapistProfile');
        $profile = $slot->therapistProfile;

        if (! $profile) {
            return 0;
        }

        $favorites = $this->availabilityRecipients($profile)->get();

        foreach ($favorites as $favorite) {
            $this->createNotification(
                accountId: $favorite->user_account_id,
                type: 'favorite_therapist_availability',
                title: "{$profile->public_name} さんの空き枠が追加されました",
                body: 'お気に入りのタチキャストが新しい空き枠を公開しました。',
                data: [
                    'therapist_profile_public_id' => $profile->public_id,
                    'availability_slot_public_id' => $slot->public_id,
                    'start_at' => $slot->start_at?->toJSON(),
                    'end_at' => $slot->end_at?->toJSON(),
                    'target_path' => "/therapists/{$profile->public_id}",
                ],
            );

            $favorite->forceFill(['last_availability_notified_at' => now()])->save();
            $this->log($favorite, 'favorite_availability_notified', [
                'availability_slot_public_id' => $slot->public_id,
            ]);
        }

        return $favorites->count();
    }

    public function countAvailabilityRecipients(TherapistProfile $profile): int
    {
        return $this->availabilityRecipients($profile)->count();
    }

    public function notifyCurrentAvailability(TherapistProfile $profile): int
    {
        $slot = $profile->availabilitySlots()
            ->where('status', TherapistAvailabilitySlot::STATUS_PUBLISHED)
            ->where('end_at', '>', now())
            ->orderBy('start_at')
            ->first();

        if (! $slot) {
            return 0;
        }

        return $this->notifyAvailability($slot);
    }

    private function availabilityRecipients(TherapistProfile $profile): Builder
    {
        return $this->eligibleFavorites($profile)
            ->where(function (Builder $query): void {
                $query
                    ->whereNull('last_availability_notified_at')
                    ->orWhere('last_availability_notified_at', '<=', now()->subMinutes(TherapistFavorite::AVAILABILITY_NOTIFICATION_COOLDOWN_MINUTES));
            })
            ->whereHas('userAccount.userProfile', fn (Builder $query) => $query->where('favorite_notify_availability', true));
    }

    private function eligibleFavorites(TherapistProfile $profile): Builder
    {
        return TherapistFavorite::query()
            ->where('therapist_profile_id', $profile->id)
            ->whereHas('userAccount', fn (Builder $query) => $query
                ->where('status', 'active')
                ->whereDoesntHave('blockedAccounts', fn (Builder $blocked) => $blocked
                    ->where('blocked_account_id', $profile->account_id))
                ->whereDoesntHave('blockedByAccounts', fn (Builder $blockedBy) => $blockedBy
                    ->where('blocker_account_id', $profile->account_id)))
            ->whereHas('therapistProfile', fn (Builder $query) => $query->publiclyViewable());
    }

    private function createNotification(int $accountId, string $type, string $title, string $body, array $data): void
    {
        AppNotification::create([
            'account_id' => $accountId,
            'notification_type' => $type,
            'channel' => 'in_app',
            'title' => $title,
            'body' => $body,
            'data_json' => $data,
            'status' => AppNotification::STATUS_SENT,
            'sent_at' => now(),
        ]);
    }

    private function log(TherapistFavorite $favorite, string $eventType, array $metadata = []): void
    {
        FavoriteEventLog::create([
            'user_account_id' => $favorite->user_account_id,
            'therapist_account_id' => $favorite->therapist_account_id,
            'therapist_profile_id' => $favorite->therapist_profile_id,
            'event_type' => $eventType,
            'metadata_json' => $metadata === [] ? null : $metadata,
        ]);
    }
}
