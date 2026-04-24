<?php

namespace App\Http\Resources;

use App\Models\TherapistProfile;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AdminTherapistProfileResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        /** @var TherapistProfile $profile */
        $profile = $this->resource;

        return [
            'public_id' => $profile->public_id,
            'public_name' => $profile->public_name,
            'bio' => $profile->bio,
            'profile_status' => $profile->profile_status,
            'training_status' => $profile->training_status,
            'photo_review_status' => $profile->photo_review_status,
            'latest_identity_verification_status' => $this->latestIdentityVerificationStatus($profile),
            'stripe_connected_account_status' => $this->stripeConnectedAccountStatus($profile),
            'account' => $this->whenLoaded('account', fn () => [
                'public_id' => $profile->account?->public_id,
                'display_name' => $profile->account?->display_name,
                'email' => $profile->account?->email,
                'status' => $profile->account?->status,
            ]),
            'latest_identity_verification' => $this->when(
                $this->relationLoaded('account') && $profile->account && $profile->account->relationLoaded('latestIdentityVerification'),
                fn () => $profile->account->latestIdentityVerification
                    ? new IdentityVerificationResource($profile->account->latestIdentityVerification)
                    : null
            ),
            'is_online' => $profile->is_online,
            'online_since' => $profile->online_since,
            'last_location_updated_at' => $profile->last_location_updated_at,
            'has_searchable_location' => $this->hasSearchableLocation($profile),
            'active_menu_count' => $this->activeMenuCount($profile),
            'location' => $this->whenLoaded('location', fn () => $profile->location ? [
                'lat' => $profile->location->lat,
                'lng' => $profile->location->lng,
                'accuracy_m' => $profile->location->accuracy_m,
                'source' => $profile->location->source,
                'is_searchable' => $profile->location->is_searchable,
                'updated_at' => $profile->location->updated_at,
            ] : null),
            'rating_average' => $profile->rating_average,
            'review_count' => $profile->review_count,
            'approved_at' => $profile->approved_at,
            'approved_by' => $this->whenLoaded('approvedBy', fn () => [
                'public_id' => $profile->approvedBy?->public_id,
                'display_name' => $profile->approvedBy?->display_name,
            ]),
            'rejected_reason_code' => $profile->rejected_reason_code,
            'menus' => TherapistMenuResource::collection($this->whenLoaded('menus')),
            'photos' => ProfilePhotoResource::collection($this->whenLoaded('photos')),
            'stripe_connected_account' => $this->when(
                $this->relationLoaded('stripeConnectedAccount'),
                fn () => new StripeConnectedAccountResource($profile->stripeConnectedAccount)
            ),
            'available_actions' => [
                'approve' => $profile->profile_status === TherapistProfile::STATUS_PENDING,
                'reject' => $profile->profile_status === TherapistProfile::STATUS_PENDING,
                'suspend' => $profile->profile_status === TherapistProfile::STATUS_APPROVED,
                'restore' => $profile->profile_status === TherapistProfile::STATUS_SUSPENDED,
            ],
            'created_at' => $profile->created_at,
            'updated_at' => $profile->updated_at,
        ];
    }

    private function activeMenuCount(TherapistProfile $profile): ?int
    {
        if ($this->hasSelectedAttribute('active_menu_count')) {
            return (int) $profile->getAttribute('active_menu_count');
        }

        if ($this->relationLoaded('menus')) {
            return $profile->menus->where('is_active', true)->count();
        }

        return null;
    }

    private function hasSearchableLocation(TherapistProfile $profile): ?bool
    {
        if ($this->hasSelectedAttribute('searchable_location_count')) {
            return (int) $profile->getAttribute('searchable_location_count') > 0;
        }

        if ($this->relationLoaded('location')) {
            return $profile->location ? (bool) $profile->location->is_searchable : false;
        }

        return null;
    }

    private function latestIdentityVerificationStatus(TherapistProfile $profile): ?string
    {
        if ($this->hasSelectedAttribute('latest_identity_verification_status')) {
            return $profile->getAttribute('latest_identity_verification_status');
        }

        if ($this->relationLoaded('account') && $profile->account && $profile->account->relationLoaded('latestIdentityVerification')) {
            return $profile->account->latestIdentityVerification?->status;
        }

        return null;
    }

    private function stripeConnectedAccountStatus(TherapistProfile $profile): ?string
    {
        if ($this->hasSelectedAttribute('stripe_connected_account_status')) {
            return $profile->getAttribute('stripe_connected_account_status');
        }

        if ($this->relationLoaded('stripeConnectedAccount')) {
            return $profile->stripeConnectedAccount?->status;
        }

        return null;
    }

    private function hasSelectedAttribute(string $attribute): bool
    {
        return array_key_exists($attribute, $this->resource->getAttributes());
    }
}
