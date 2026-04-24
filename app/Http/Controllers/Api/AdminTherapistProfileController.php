<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Api\Concerns\RecordsAdminAuditLogs;
use App\Http\Controllers\Api\Concerns\ResolvesAdminFilterIds;
use App\Http\Controllers\Controller;
use App\Http\Resources\AdminTherapistProfileResource;
use App\Models\IdentityVerification;
use App\Models\ProfilePhoto;
use App\Models\StripeConnectedAccount;
use App\Models\TherapistProfile;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class AdminTherapistProfileController extends Controller
{
    use AuthorizesAdminRequests;
    use RecordsAdminAuditLogs;
    use ResolvesAdminFilterIds;

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorizeAdmin($request->user());

        $validated = $request->validate([
            'account_id' => ['nullable', 'string', 'max:36'],
            'status' => ['nullable', Rule::in([
                TherapistProfile::STATUS_DRAFT,
                TherapistProfile::STATUS_PENDING,
                TherapistProfile::STATUS_APPROVED,
                TherapistProfile::STATUS_REJECTED,
                TherapistProfile::STATUS_SUSPENDED,
            ])],
            'photo_review_status' => ['nullable', Rule::in([
                ProfilePhoto::STATUS_PENDING,
                ProfilePhoto::STATUS_APPROVED,
                ProfilePhoto::STATUS_REJECTED,
            ])],
            'training_status' => ['nullable', 'string', 'max:50'],
            'is_online' => ['nullable', 'boolean'],
            'has_searchable_location' => ['nullable', 'boolean'],
            'has_active_menu' => ['nullable', 'boolean'],
            'latest_identity_verification_status' => ['nullable', Rule::in([
                IdentityVerification::STATUS_PENDING,
                IdentityVerification::STATUS_APPROVED,
                IdentityVerification::STATUS_REJECTED,
                'none',
            ])],
            'stripe_connected_account_status' => ['nullable', Rule::in([
                StripeConnectedAccount::STATUS_PENDING,
                StripeConnectedAccount::STATUS_REQUIREMENTS_DUE,
                StripeConnectedAccount::STATUS_ACTIVE,
                StripeConnectedAccount::STATUS_RESTRICTED,
                'none',
            ])],
            'q' => ['nullable', 'string', 'max:100'],
            'sort' => ['nullable', Rule::in(['created_at', 'approved_at', 'rating_average', 'review_count'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
        ]);
        $accountId = $this->resolveAccountId($validated['account_id'] ?? null);
        $sort = $validated['sort'] ?? 'created_at';
        $direction = $validated['direction'] ?? 'desc';

        return AdminTherapistProfileResource::collection(
            TherapistProfile::query()
                ->addSelect([
                    'latest_identity_verification_status' => IdentityVerification::query()
                        ->select('status')
                        ->whereColumn('account_id', 'therapist_profiles.account_id')
                        ->latest('id')
                        ->limit(1),
                    'stripe_connected_account_status' => StripeConnectedAccount::query()
                        ->select('status')
                        ->whereColumn('therapist_profile_id', 'therapist_profiles.id')
                        ->limit(1),
                ])
                ->with(['account', 'approvedBy', 'menus'])
                ->withCount([
                    'menus as active_menu_count' => fn ($query) => $query->where('is_active', true),
                    'location as searchable_location_count' => fn ($query) => $query->where('is_searchable', true),
                ])
                ->when($accountId, fn ($query, int $id) => $query->where('account_id', $id))
                ->when($validated['status'] ?? null, fn ($query, string $status) => $query->where('profile_status', $status))
                ->when(
                    $validated['photo_review_status'] ?? null,
                    fn ($query, string $photoReviewStatus) => $query->where('photo_review_status', $photoReviewStatus)
                )
                ->when(
                    $validated['training_status'] ?? null,
                    fn ($query, string $trainingStatus) => $query->where('training_status', $trainingStatus)
                )
                ->when(
                    array_key_exists('is_online', $validated),
                    fn ($query) => $query->where('is_online', (bool) $validated['is_online'])
                )
                ->when(
                    array_key_exists('has_searchable_location', $validated),
                    fn ($query) => $validated['has_searchable_location']
                        ? $query->whereHas('location', fn ($location) => $location->where('is_searchable', true))
                        : $query->whereDoesntHave('location', fn ($location) => $location->where('is_searchable', true))
                )
                ->when(
                    array_key_exists('has_active_menu', $validated),
                    fn ($query) => $validated['has_active_menu']
                        ? $query->whereHas('menus', fn ($menu) => $menu->where('is_active', true))
                        : $query->whereDoesntHave('menus', fn ($menu) => $menu->where('is_active', true))
                )
                ->when(
                    $validated['latest_identity_verification_status'] ?? null,
                    function ($query, string $status): void {
                        if ($status === 'none') {
                            $query->whereDoesntHave('account.latestIdentityVerification');

                            return;
                        }

                        $query->whereHas('account.latestIdentityVerification', fn ($verification) => $verification->where('status', $status));
                    }
                )
                ->when(
                    $validated['stripe_connected_account_status'] ?? null,
                    function ($query, string $status): void {
                        if ($status === 'none') {
                            $query->whereDoesntHave('stripeConnectedAccount');

                            return;
                        }

                        $query->whereHas('stripeConnectedAccount', fn ($connectedAccount) => $connectedAccount->where('status', $status));
                    }
                )
                ->when($validated['q'] ?? null, function ($query, string $term): void {
                    $query->where(function ($query) use ($term): void {
                        $query
                            ->where('public_id', $term)
                            ->orWhere('public_name', 'like', "%{$term}%")
                            ->orWhereHas('account', fn ($query) => $query
                                ->where('email', 'like', "%{$term}%")
                                ->orWhere('display_name', 'like', "%{$term}%"));
                    });
                })
                ->orderBy($sort, $direction)
                ->orderBy('id', $direction)
                ->get()
        );
    }

    public function show(Request $request, TherapistProfile $therapistProfile): AdminTherapistProfileResource
    {
        $this->authorizeAdmin($request->user());

        $therapistProfile->load([
            'account.latestIdentityVerification.reviewedBy',
            'approvedBy',
            'menus',
            'location',
            'photos.account',
            'photos.therapistProfile',
            'photos.reviewedBy',
            'stripeConnectedAccount',
        ]);

        $this->recordAdminAudit($request, 'therapist_profile.view', $therapistProfile, [], $this->snapshot($therapistProfile));

        return new AdminTherapistProfileResource($therapistProfile);
    }

    public function approve(Request $request, TherapistProfile $therapistProfile): AdminTherapistProfileResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        abort_unless($therapistProfile->profile_status === TherapistProfile::STATUS_PENDING, 409, 'Only pending therapist profiles can be approved.');

        $before = $this->snapshot($therapistProfile);

        $therapistProfile->forceFill([
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'approved_by_account_id' => $admin->id,
            'approved_at' => now(),
            'rejected_reason_code' => null,
        ])->save();

        $this->recordAdminAudit($request, 'therapist_profile.approve', $therapistProfile, $before, $this->snapshot($therapistProfile->refresh()));

        return new AdminTherapistProfileResource($therapistProfile->load(['account', 'approvedBy', 'menus']));
    }

    public function reject(Request $request, TherapistProfile $therapistProfile): AdminTherapistProfileResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        abort_unless($therapistProfile->profile_status === TherapistProfile::STATUS_PENDING, 409, 'Only pending therapist profiles can be rejected.');

        $validated = $request->validate([
            'rejected_reason_code' => ['required', 'string', 'max:100'],
        ]);
        $before = $this->snapshot($therapistProfile);

        $therapistProfile->forceFill([
            'profile_status' => TherapistProfile::STATUS_REJECTED,
            'is_online' => false,
            'approved_by_account_id' => null,
            'approved_at' => null,
            'rejected_reason_code' => $validated['rejected_reason_code'],
        ])->save();

        $this->recordAdminAudit($request, 'therapist_profile.reject', $therapistProfile, $before, $this->snapshot($therapistProfile->refresh()));

        return new AdminTherapistProfileResource($therapistProfile->load(['account', 'approvedBy', 'menus']));
    }

    public function suspend(Request $request, TherapistProfile $therapistProfile): AdminTherapistProfileResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        abort_unless($therapistProfile->profile_status === TherapistProfile::STATUS_APPROVED, 409, 'Only approved therapist profiles can be suspended.');

        $validated = $request->validate([
            'rejected_reason_code' => ['nullable', 'string', 'max:100'],
        ]);
        $before = $this->snapshot($therapistProfile);

        $therapistProfile->forceFill([
            'profile_status' => TherapistProfile::STATUS_SUSPENDED,
            'is_online' => false,
            'rejected_reason_code' => $validated['rejected_reason_code'] ?? 'admin_suspended',
        ])->save();

        $this->recordAdminAudit($request, 'therapist_profile.suspend', $therapistProfile, $before, $this->snapshot($therapistProfile->refresh()));

        return new AdminTherapistProfileResource($therapistProfile->load(['account', 'approvedBy', 'menus']));
    }

    public function restore(Request $request, TherapistProfile $therapistProfile): AdminTherapistProfileResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        abort_unless($therapistProfile->profile_status === TherapistProfile::STATUS_SUSPENDED, 409, 'Only suspended therapist profiles can be restored.');

        $before = $this->snapshot($therapistProfile);

        $therapistProfile->forceFill([
            'profile_status' => TherapistProfile::STATUS_DRAFT,
            'is_online' => false,
            'online_since' => null,
            'approved_at' => null,
            'approved_by_account_id' => null,
        ])->save();

        $this->recordAdminAudit($request, 'therapist_profile.restore', $therapistProfile, $before, $this->snapshot($therapistProfile->refresh()));

        return new AdminTherapistProfileResource($therapistProfile->load(['account', 'approvedBy', 'menus']));
    }

    private function snapshot(TherapistProfile $therapistProfile): array
    {
        return $therapistProfile->only([
            'id',
            'public_id',
            'account_id',
            'public_name',
            'profile_status',
            'training_status',
            'photo_review_status',
            'is_online',
            'approved_at',
            'approved_by_account_id',
            'rejected_reason_code',
        ]);
    }
}
