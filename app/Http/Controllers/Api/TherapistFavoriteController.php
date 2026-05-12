<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\TherapistFavoriteResource;
use App\Http\Resources\TherapistFavoriteUserResource;
use App\Models\FavoriteEventLog;
use App\Models\ProfilePhoto;
use App\Models\TherapistFavorite;
use App\Models\TherapistProfile;
use App\Models\UserProfile;
use App\Services\Favorites\TherapistFavoriteNotificationService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

class TherapistFavoriteController extends Controller
{
    public function __construct(
        private readonly TherapistFavoriteNotificationService $notificationService,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $favorites = TherapistFavorite::query()
            ->where('user_account_id', $request->user()->id)
            ->whereHas('therapistProfile', fn (Builder $query) => $query->visibleTo($request->user()))
            ->with([
                'therapistProfile.photos' => fn ($query) => $query
                    ->where('status', ProfilePhoto::STATUS_APPROVED)
                    ->where('visibility', ProfilePhoto::VISIBILITY_PUBLIC)
                    ->orderBy('sort_order')
                    ->orderBy('id'),
            ])
            ->latest()
            ->get();

        $favorites->each(function (TherapistFavorite $favorite): void {
            if ($favorite->therapistProfile) {
                $favorite->therapistProfile->loadCount('favorites');
            }
        });

        return TherapistFavoriteResource::collection($favorites);
    }

    public function users(Request $request): AnonymousResourceCollection
    {
        $profile = $request->user()->therapistProfile()->firstOrFail();

        $favorites = TherapistFavorite::query()
            ->where('therapist_profile_id', $profile->id)
            ->whereHas('userAccount', fn (Builder $query) => $query
                ->where('status', 'active')
                ->whereDoesntHave('blockedAccounts', fn (Builder $blocked) => $blocked
                    ->where('blocked_account_id', $profile->account_id))
                ->whereDoesntHave('blockedByAccounts', fn (Builder $blockedBy) => $blockedBy
                    ->where('blocker_account_id', $profile->account_id)))
            ->with('userAccount')
            ->latest()
            ->get();

        return TherapistFavoriteUserResource::collection($favorites);
    }

    public function store(Request $request, TherapistProfile $therapistProfile): JsonResponse
    {
        $profile = TherapistProfile::query()
            ->visibleTo($request->user())
            ->whereKey($therapistProfile->id)
            ->firstOrFail();

        $existing = TherapistFavorite::query()
            ->where('user_account_id', $request->user()->id)
            ->where('therapist_profile_id', $profile->id)
            ->first();

        $this->abortIfCoolingDown($request->user()->id, $profile->id, $existing);

        $favorite = DB::transaction(function () use ($request, $profile, $existing): TherapistFavorite {
            $request->user()->roleAssignments()->firstOrCreate(
                ['role' => 'user'],
                ['status' => 'active', 'granted_at' => now()],
            );
            $request->user()->userProfile()->firstOrCreate(
                ['account_id' => $request->user()->id],
                [
                    'profile_status' => UserProfile::STATUS_INCOMPLETE,
                    'favorite_notify_online' => true,
                    'favorite_notify_availability' => true,
                    'favorite_email_notifications_enabled' => true,
                ],
            );

            $favorite = $existing ?? new TherapistFavorite([
                'user_account_id' => $request->user()->id,
                'therapist_account_id' => $profile->account_id,
                'therapist_profile_id' => $profile->id,
            ]);

            $favorite->forceFill(['last_action_at' => now()])->save();

            FavoriteEventLog::create([
                'user_account_id' => $favorite->user_account_id,
                'therapist_account_id' => $favorite->therapist_account_id,
                'therapist_profile_id' => $favorite->therapist_profile_id,
                'event_type' => 'favorite_created',
            ]);

            return $favorite->refresh();
        });

        if (! $existing) {
            $this->notificationService->notifyFavoriteAdded($favorite);
        }

        return response()->json([
            'data' => [
                'is_favorited' => true,
                'favorite_count' => $profile->favorites()->count(),
                'cooldown_until' => $favorite->last_action_at?->copy()->addMinutes(TherapistFavorite::ACTION_COOLDOWN_MINUTES)?->toJSON(),
            ],
        ], 201);
    }

    public function destroy(Request $request, TherapistProfile $therapistProfile): JsonResponse
    {
        $favorite = TherapistFavorite::query()
            ->where('user_account_id', $request->user()->id)
            ->where('therapist_profile_id', $therapistProfile->id)
            ->first();

        $this->abortIfCoolingDown($request->user()->id, $therapistProfile->id, $favorite);

        if ($favorite) {
            FavoriteEventLog::create([
                'user_account_id' => $favorite->user_account_id,
                'therapist_account_id' => $favorite->therapist_account_id,
                'therapist_profile_id' => $favorite->therapist_profile_id,
                'event_type' => 'favorite_removed',
            ]);

            $favorite->delete();
        }

        return response()->json([
            'data' => [
                'is_favorited' => false,
                'favorite_count' => $therapistProfile->favorites()->count(),
                'cooldown_until' => now()->addMinutes(TherapistFavorite::ACTION_COOLDOWN_MINUTES)->toJSON(),
            ],
        ]);
    }

    private function abortIfCoolingDown(int $userAccountId, int $therapistProfileId, ?TherapistFavorite $favorite): void
    {
        $lastActionAt = $favorite?->last_action_at
            ?? FavoriteEventLog::query()
                ->where('user_account_id', $userAccountId)
                ->where('therapist_profile_id', $therapistProfileId)
                ->whereIn('event_type', ['favorite_created', 'favorite_removed'])
                ->latest()
                ->value('created_at');

        if (! $lastActionAt) {
            return;
        }

        $cooldownUntil = \Illuminate\Support\Carbon::parse($lastActionAt)
            ->addMinutes(TherapistFavorite::ACTION_COOLDOWN_MINUTES);

        abort_if(
            $cooldownUntil->isFuture(),
            429,
            'お気に入りの追加・解除は少し時間をおいてから実行してください。'
        );
    }
}
