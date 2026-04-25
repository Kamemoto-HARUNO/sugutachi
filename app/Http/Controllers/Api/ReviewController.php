<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ReviewResource;
use App\Models\Account;
use App\Models\Booking;
use App\Models\Review;
use App\Models\TherapistProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

class ReviewController extends Controller
{
    private const REVIEWABLE_STATUSES = [
        Booking::STATUS_THERAPIST_COMPLETED,
        Booking::STATUS_COMPLETED,
    ];

    public function therapistReviews(Request $request, TherapistProfile $therapistProfile): AnonymousResourceCollection
    {
        $profile = TherapistProfile::query()
            ->visibleTo($request->user() ?? Auth::guard('sanctum')->user())
            ->whereKey($therapistProfile->id)
            ->firstOrFail();

        return ReviewResource::collection(
            Review::query()
                ->with(['booking', 'reviewer', 'reviewee'])
                ->where('reviewee_account_id', $profile->account_id)
                ->where('reviewer_role', 'user')
                ->where('status', Review::STATUS_VISIBLE)
                ->latest()
                ->get()
        );
    }

    public function me(Request $request): AnonymousResourceCollection
    {
        $accountId = $request->user()->id;

        return ReviewResource::collection(
            Review::query()
                ->with(['booking', 'reviewer', 'reviewee'])
                ->where(fn ($query) => $query
                    ->where('reviewer_account_id', $accountId)
                    ->orWhere('reviewee_account_id', $accountId))
                ->latest()
                ->get()
        );
    }

    public function store(Request $request, Booking $booking): JsonResponse
    {
        abort_unless(in_array($booking->status, self::REVIEWABLE_STATUSES, true), 409, 'This booking is not reviewable yet.');

        $actor = $request->user();
        [$reviewerRole, $revieweeId] = $this->reviewContext($booking, $actor);
        abort_if(
            $booking->reviews()->where('reviewer_account_id', $actor->id)->exists(),
            409,
            'You have already reviewed this booking.'
        );

        $validated = $request->validate([
            'rating_overall' => ['required', 'integer', 'between:1,5'],
            'rating_manners' => ['nullable', 'integer', 'between:1,5'],
            'rating_skill' => ['nullable', 'integer', 'between:1,5'],
            'rating_cleanliness' => ['nullable', 'integer', 'between:1,5'],
            'rating_safety' => ['nullable', 'integer', 'between:1,5'],
            'public_comment' => ['nullable', 'string', 'max:500'],
            'private_feedback' => ['nullable', 'string', 'max:2000'],
        ]);

        $review = DB::transaction(function () use ($actor, $booking, $revieweeId, $reviewerRole, $validated): Review {
            $review = Review::create([
                'booking_id' => $booking->id,
                'reviewer_account_id' => $actor->id,
                'reviewee_account_id' => $revieweeId,
                'reviewer_role' => $reviewerRole,
                'rating_overall' => $validated['rating_overall'],
                'rating_manners' => $validated['rating_manners'] ?? null,
                'rating_skill' => $validated['rating_skill'] ?? null,
                'rating_cleanliness' => $validated['rating_cleanliness'] ?? null,
                'rating_safety' => $validated['rating_safety'] ?? null,
                'public_comment' => $validated['public_comment'] ?? null,
                'private_feedback_encrypted' => filled($validated['private_feedback'] ?? null)
                    ? Crypt::encryptString($validated['private_feedback'])
                    : null,
                'status' => Review::STATUS_VISIBLE,
            ]);

            if ($reviewerRole === 'user') {
                $this->refreshTherapistRating($booking->therapistProfile);
            }

            return $review;
        });

        return (new ReviewResource($review->load(['booking', 'reviewer', 'reviewee'])))
            ->response()
            ->setStatusCode(201);
    }

    private function reviewContext(Booking $booking, Account $actor): array
    {
        if ($booking->user_account_id === $actor->id) {
            return ['user', $booking->therapist_account_id];
        }

        if ($booking->therapist_account_id === $actor->id) {
            return ['therapist', $booking->user_account_id];
        }

        abort(404);
    }

    private function refreshTherapistRating(?TherapistProfile $therapistProfile): void
    {
        if (! $therapistProfile) {
            return;
        }

        $summary = Review::query()
            ->where('reviewee_account_id', $therapistProfile->account_id)
            ->where('reviewer_role', 'user')
            ->where('status', Review::STATUS_VISIBLE)
            ->selectRaw('count(*) as review_count, avg(rating_overall) as rating_average')
            ->first();

        $therapistProfile->forceFill([
            'review_count' => (int) $summary->review_count,
            'rating_average' => round((float) $summary->rating_average, 2),
        ])->save();
    }
}
