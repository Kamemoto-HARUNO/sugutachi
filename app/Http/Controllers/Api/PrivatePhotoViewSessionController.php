<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\IdentityVerification;
use App\Models\PrivatePhotoViewSession;
use App\Models\ProfilePhoto;
use App\Models\TherapistProfile;
use App\Services\ProfilePhotos\PrivatePhotoWatermarkRenderer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PrivatePhotoViewSessionController extends Controller
{
    public function store(Request $request, TherapistProfile $therapistProfile): JsonResponse
    {
        $viewer = $request->user();
        $profileQuery = TherapistProfile::query()
            ->with([
                'account.latestIdentityVerification',
                'photos' => fn ($query) => $query
                    ->where('status', ProfilePhoto::STATUS_APPROVED)
                    ->where('visibility', ProfilePhoto::VISIBILITY_PRIVATE)
                    ->orderBy('sort_order')
                    ->orderBy('id'),
            ]);

        $profile = $viewer->id === $therapistProfile->account_id
            ? $profileQuery->whereKey($therapistProfile->id)->firstOrFail()
            : $profileQuery->visibleTo($viewer)->whereKey($therapistProfile->id)->firstOrFail();

        $isOwnerPreview = $viewer->id === $profile->account_id;

        $this->ensureViewerCanAccessPrivatePhotos($viewer, $profile, $isOwnerPreview);

        $lock = $isOwnerPreview ? null : $this->latestLock($viewer, $profile);

        if ($lock) {
            return response()->json([
                'message' => 'この非公開写真はまだ再表示できません。',
                'data' => [
                    'next_available_at' => $lock->locked_until?->toIso8601String(),
                ],
            ], 423);
        }

        abort_if($profile->photos->isEmpty(), 404);

        PrivatePhotoViewSession::query()
            ->where('viewer_account_id', $viewer->id)
            ->where('therapist_profile_id', $profile->id)
            ->whereNull('closed_at')
            ->update([
                'closed_at' => now(),
                'close_reason' => PrivatePhotoViewSession::CLOSE_REASON_SUPERSEDED,
                'updated_at' => now(),
            ]);

        $session = PrivatePhotoViewSession::create([
            'session_token' => 'pvs_'.Str::ulid(),
            'viewer_account_id' => $viewer->id,
            'therapist_profile_id' => $profile->id,
            'photo_count' => $profile->photos->count(),
            'watermark_label' => $this->watermarkLabel($viewer),
            'opened_at' => now(),
            'ip_hash' => $request->ip() ? hash('sha256', $request->ip()) : null,
            'user_agent' => Str::limit((string) $request->userAgent(), 1000, ''),
        ]);

        return response()->json([
            'data' => [
                'session_token' => $session->session_token,
                'photos' => $profile->photos->map(fn (ProfilePhoto $photo): array => [
                    'id' => $photo->id,
                    'sort_order' => $photo->sort_order,
                ])->values(),
            ],
        ], 201);
    }

    public function show(
        Request $request,
        string $sessionToken,
        ProfilePhoto $profilePhoto,
        PrivatePhotoWatermarkRenderer $renderer,
    ): Response {
        $session = $this->activateSession($request->user(), $sessionToken);

        abort_unless($profilePhoto->therapist_profile_id === $session->therapist_profile_id, 404);
        abort_unless($profilePhoto->status === ProfilePhoto::STATUS_APPROVED, 404);
        abort_unless($profilePhoto->visibility === ProfilePhoto::VISIBILITY_PRIVATE, 404);

        $rendered = $renderer->render($profilePhoto, $session->watermark_label);

        $headers = [
            'Content-Type' => $rendered['mime_type'],
            'Cache-Control' => 'no-store, private, max-age=0',
            'Pragma' => 'no-cache',
            'Expires' => '0',
            'X-Private-Photo-Expires-At' => $session->expires_at?->toIso8601String() ?? '',
        ];

        if ($session->locked_until !== null) {
            $headers['X-Private-Photo-Locked-Until'] = $session->locked_until->toIso8601String();
        }

        return response($rendered['binary'], 200, $headers);
    }

    public function close(Request $request, string $sessionToken): JsonResponse
    {
        $validated = $request->validate([
            'close_reason' => ['nullable', Rule::in([
                PrivatePhotoViewSession::CLOSE_REASON_AUTO_HIDDEN,
                PrivatePhotoViewSession::CLOSE_REASON_FETCH_FAILED,
                PrivatePhotoViewSession::CLOSE_REASON_MANUAL,
                PrivatePhotoViewSession::CLOSE_REASON_NAVIGATED,
                PrivatePhotoViewSession::CLOSE_REASON_TAB_HIDDEN,
            ])],
        ]);

        $session = PrivatePhotoViewSession::query()
            ->where('session_token', $sessionToken)
            ->where('viewer_account_id', $request->user()->id)
            ->firstOrFail();

        if (! $session->closed_at) {
            $session->forceFill([
                'closed_at' => now(),
                'close_reason' => $validated['close_reason'] ?? PrivatePhotoViewSession::CLOSE_REASON_MANUAL,
            ])->save();
        }

        return response()->json([
            'data' => [
                'closed_at' => $session->closed_at?->toIso8601String(),
                'next_available_at' => $session->locked_until?->toIso8601String(),
            ],
        ]);
    }

    private function activateSession(Account $viewer, string $sessionToken): PrivatePhotoViewSession
    {
        [$session, $expired] = DB::transaction(function () use ($viewer, $sessionToken): array {
            /** @var PrivatePhotoViewSession $session */
            $session = PrivatePhotoViewSession::query()
                ->with('therapistProfile')
                ->where('session_token', $sessionToken)
                ->lockForUpdate()
                ->firstOrFail();

            abort_unless($session->viewer_account_id === $viewer->id, 404);

            if ($session->closed_at) {
                abort(410, 'この非公開写真の表示は終了しました。');
            }

            $expired = $session->expires_at !== null && $session->expires_at->isPast();

            if ($expired) {
                $session->forceFill([
                    'closed_at' => $session->closed_at ?? now(),
                    'close_reason' => $session->close_reason ?? PrivatePhotoViewSession::CLOSE_REASON_EXPIRED,
                ])->save();

                return [$session->refresh(), true];
            }

            if ($session->display_started_at === null) {
                $startedAt = now();
                $isOwnerPreview = $session->viewer_account_id === $session->therapistProfile?->account_id;
                $attributes = [
                    'display_started_at' => $startedAt,
                    'expires_at' => $startedAt->copy()->addSeconds(PrivatePhotoViewSession::DISPLAY_SECONDS),
                ];

                if (! $isOwnerPreview) {
                    $attributes['locked_until'] = $startedAt->copy()->addHours(PrivatePhotoViewSession::LOCK_HOURS);
                }

                $session->forceFill($attributes)->save();
            }

            return [$session->refresh(), false];
        });

        if ($expired) {
            abort(410, 'この非公開写真の表示は終了しました。');
        }

        return $session;
    }

    private function ensureViewerCanAccessPrivatePhotos(Account $viewer, TherapistProfile $profile, bool $isOwnerPreview): void
    {
        abort_unless($viewer->status === Account::STATUS_ACTIVE, 403);

        if ($isOwnerPreview) {
            return;
        }

        if ($viewer->latestIdentityVerification?->status !== IdentityVerification::STATUS_APPROVED) {
            throw ValidationException::withMessages([
                'private_photos' => '非公開写真は本人確認済み会員のみ閲覧できます。',
            ]);
        }
    }

    private function latestLock(Account $viewer, TherapistProfile $profile): ?PrivatePhotoViewSession
    {
        return PrivatePhotoViewSession::query()
            ->where('viewer_account_id', $viewer->id)
            ->where('therapist_profile_id', $profile->id)
            ->whereNotNull('locked_until')
            ->where('locked_until', '>', now())
            ->latest('locked_until')
            ->first();
    }

    private function watermarkLabel(Account $viewer): string
    {
        $suffix = Str::upper(Str::substr($viewer->public_id, -4));
        $viewedAt = now()->timezone(config('app.timezone'))->format('Y-m-d H:i');

        return sprintf('ID:%s %s', $suffix, $viewedAt);
    }
}
