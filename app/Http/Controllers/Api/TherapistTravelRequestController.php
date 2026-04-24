<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\TherapistTravelRequestResource;
use App\Models\Account;
use App\Models\AppNotification;
use App\Models\IdentityVerification;
use App\Models\TherapistProfile;
use App\Models\TherapistTravelRequest;
use App\Support\ContactExchangeDetector;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class TherapistTravelRequestController extends Controller
{
    public function store(
        Request $request,
        TherapistProfile $therapistProfile,
        ContactExchangeDetector $detector,
    ): JsonResponse {
        $validated = $request->validate([
            'prefecture' => ['required', 'string', 'max:50'],
            'message' => ['required', 'string', 'min:1', 'max:1000'],
        ]);

        $actor = $request->user();

        abort_if($therapistProfile->account_id === $actor->id, 409, 'You cannot send a travel request to yourself.');

        $targetProfile = TherapistProfile::query()
            ->whereKey($therapistProfile->id)
            ->where('profile_status', TherapistProfile::STATUS_APPROVED)
            ->whereHas('account', function (Builder $query) use ($actor): void {
                $query
                    ->where('status', Account::STATUS_ACTIVE)
                    ->whereDoesntHave('blockedByAccounts', fn (Builder $blockedBy) => $blockedBy
                        ->where('blocker_account_id', $actor->id))
                    ->whereDoesntHave('blockedAccounts', fn (Builder $blocked) => $blocked
                        ->where('blocked_account_id', $actor->id));
            })
            ->whereHas('account.latestIdentityVerification', fn (Builder $query) => $query
                ->where('status', IdentityVerification::STATUS_APPROVED))
            ->firstOrFail();

        if ($detector->detects($validated['message'])) {
            return response()->json([
                'message' => 'Contact exchange is not allowed in travel requests.',
            ], 422);
        }

        $recentRequestCount = TherapistTravelRequest::query()
            ->where('user_account_id', $actor->id)
            ->where('created_at', '>=', now()->subDays(7))
            ->count();

        abort_if($recentRequestCount >= 5, 429, 'Travel request rate limit exceeded.');

        abort_if(
            TherapistTravelRequest::query()
                ->where('user_account_id', $actor->id)
                ->where('therapist_account_id', $targetProfile->account_id)
                ->where('prefecture', $validated['prefecture'])
                ->where('created_at', '>=', now()->subDays(7))
                ->exists(),
            409,
            'A recent travel request for the same prefecture already exists.'
        );

        $travelRequest = DB::transaction(function () use ($actor, $targetProfile, $validated): TherapistTravelRequest {
            $travelRequest = TherapistTravelRequest::create([
                'public_id' => 'trv_'.Str::ulid(),
                'user_account_id' => $actor->id,
                'therapist_account_id' => $targetProfile->account_id,
                'therapist_profile_id' => $targetProfile->id,
                'prefecture' => $validated['prefecture'],
                'message_encrypted' => Crypt::encryptString($validated['message']),
                'detected_contact_exchange' => false,
                'status' => TherapistTravelRequest::STATUS_UNREAD,
            ]);

            AppNotification::create([
                'account_id' => $targetProfile->account_id,
                'notification_type' => 'travel_request_received',
                'channel' => 'in_app',
                'title' => '新しい出張リクエスト',
                'body' => "{$validated['prefecture']}で会いたいユーザーからリクエストが届きました。",
                'data_json' => [
                    'travel_request_id' => $travelRequest->public_id,
                    'therapist_profile_id' => $targetProfile->public_id,
                ],
                'status' => 'sent',
                'sent_at' => now(),
            ]);

            return $travelRequest;
        });

        return (new TherapistTravelRequestResource($travelRequest->load(['userAccount', 'therapistProfile'])))
            ->response()
            ->setStatusCode(201);
    }

    public function index(Request $request): AnonymousResourceCollection
    {
        $validated = $request->validate([
            'status' => ['nullable', Rule::in([
                TherapistTravelRequest::STATUS_UNREAD,
                TherapistTravelRequest::STATUS_READ,
                TherapistTravelRequest::STATUS_ARCHIVED,
            ])],
            'prefecture' => ['nullable', 'string', 'max:50'],
            'submitted_from' => ['nullable', 'date'],
            'submitted_to' => ['nullable', 'date', 'after_or_equal:submitted_from'],
            'q' => ['nullable', 'string', 'max:120'],
            'sort' => ['nullable', Rule::in(['created_at', 'prefecture', 'status'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
        ]);

        $profile = $request->user()->therapistProfile()->firstOrFail();

        $requests = TherapistTravelRequest::query()
            ->with(['userAccount', 'therapistProfile'])
            ->where('therapist_profile_id', $profile->id)
            ->when(isset($validated['status']), fn (Builder $query) => $query->where('status', $validated['status']))
            ->when(isset($validated['prefecture']), fn (Builder $query) => $query->where('prefecture', $validated['prefecture']))
            ->when(isset($validated['submitted_from']), fn (Builder $query) => $query->where('created_at', '>=', $validated['submitted_from']))
            ->when(isset($validated['submitted_to']), fn (Builder $query) => $query->where('created_at', '<=', $validated['submitted_to']))
            ->when(isset($validated['q']), function (Builder $query) use ($validated): void {
                $query->where(function (Builder $query) use ($validated): void {
                    $query
                        ->where('prefecture', 'like', '%'.$validated['q'].'%')
                        ->orWhereHas('userAccount', fn (Builder $sender) => $sender
                            ->where('display_name', 'like', '%'.$validated['q'].'%'));
                });
            })
            ->orderBy($validated['sort'] ?? 'created_at', $validated['direction'] ?? 'desc')
            ->get();

        return TherapistTravelRequestResource::collection($requests);
    }

    public function show(Request $request, TherapistTravelRequest $travelRequest): TherapistTravelRequestResource
    {
        $this->authorizeTherapist($request, $travelRequest);

        return new TherapistTravelRequestResource($travelRequest->load(['userAccount', 'therapistProfile']));
    }

    public function read(Request $request, TherapistTravelRequest $travelRequest): TherapistTravelRequestResource
    {
        $this->authorizeTherapist($request, $travelRequest);

        if ($travelRequest->status !== TherapistTravelRequest::STATUS_ARCHIVED) {
            $travelRequest->forceFill([
                'status' => TherapistTravelRequest::STATUS_READ,
            ])->save();
        }

        if (! $travelRequest->read_at) {
            $travelRequest->forceFill([
                'read_at' => now(),
            ])->save();
        }

        return new TherapistTravelRequestResource($travelRequest->refresh()->load(['userAccount', 'therapistProfile']));
    }

    public function archive(Request $request, TherapistTravelRequest $travelRequest): TherapistTravelRequestResource
    {
        $this->authorizeTherapist($request, $travelRequest);

        $attributes = [
            'status' => TherapistTravelRequest::STATUS_ARCHIVED,
            'archived_at' => now(),
        ];

        if (! $travelRequest->read_at) {
            $attributes['read_at'] = now();
        }

        $travelRequest->forceFill($attributes)->save();

        return new TherapistTravelRequestResource($travelRequest->refresh()->load(['userAccount', 'therapistProfile']));
    }

    private function authorizeTherapist(Request $request, TherapistTravelRequest $travelRequest): void
    {
        $profile = $request->user()->therapistProfile()->firstOrFail();

        abort_unless(
            $travelRequest->therapist_account_id === $request->user()->id
                && $travelRequest->therapist_profile_id === $profile->id,
            404
        );
    }
}
