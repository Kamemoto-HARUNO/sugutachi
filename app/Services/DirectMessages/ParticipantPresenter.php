<?php

namespace App\Services\DirectMessages;

use App\Models\Account;
use App\Models\ProfilePhoto;
use Illuminate\Support\Facades\URL;

class ParticipantPresenter
{
    public function present(?Account $account, string $role): array
    {
        if (! $account) {
            return ['role' => $role, 'public_id' => null, 'display_name' => '退会済み', 'avatar_url' => null, 'profile_url' => null];
        }
        $profile = $role === 'user'
            ? $account->userProfile
            : $account->therapistProfile;
        $withdrawn = $account->status === Account::STATUS_WITHDRAWN;
        $photo = $withdrawn ? null : $account->profilePhotos()
            ->where('usage_type', $role === 'user' ? 'account_profile' : 'therapist_profile')
            ->when($role === 'user', fn ($q) => $q->whereNull('therapist_profile_id'))
            ->when($role === 'therapist', fn ($q) => $q->where('therapist_profile_id', $profile?->id)->where('visibility', 'public'))
            ->where('status', ProfilePhoto::STATUS_APPROVED)->orderBy('sort_order')->first();

        return [
            'role' => $role,
            'public_id' => $profile?->public_id,
            'display_name' => $this->displayName($account, $role),
            'avatar_url' => $photo ? URL::temporarySignedRoute('profile-photos.signed-file', now()->addMinutes(5), ['profilePhoto' => $photo->id]) : null,
            'profile_url' => ! $withdrawn && $role === 'therapist' && $profile ? '/therapists/'.$profile->public_id : null,
        ];
    }

    public function displayName(?Account $account, string $role): string
    {
        if (! $account || $account->status === Account::STATUS_WITHDRAWN) {
            return '退会済み';
        }

        return $role === 'user' ? ($account->display_name ?: '利用者') : ($account->therapistProfile?->public_name ?: 'タチキャスト');
    }
}
