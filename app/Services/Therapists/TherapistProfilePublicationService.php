<?php

namespace App\Services\Therapists;

use App\Models\IdentityVerification;
use App\Models\TherapistProfile;

class TherapistProfilePublicationService
{
    /**
     * @return array<int, array{key:string,label:string,is_satisfied:bool,message:string}>
     */
    public function requirements(TherapistProfile $profile): array
    {
        $profile->loadMissing(['menus', 'account.latestIdentityVerification']);

        $activeMenuCount = $profile->menus->where('is_active', true)->count();
        $identityVerificationStatus = $profile->account?->latestIdentityVerification?->status;

        return [
            [
                'key' => 'public_name',
                'label' => '公開名',
                'is_satisfied' => filled($profile->public_name),
                'message' => '公開名の入力が必要です。',
            ],
            [
                'key' => 'active_menu',
                'label' => '公開中の対応内容',
                'is_satisfied' => $activeMenuCount > 0,
                'message' => '公開中の対応内容を1件以上登録してください。',
            ],
            [
                'key' => 'identity_verification',
                'label' => '本人確認・年齢確認',
                'is_satisfied' => $identityVerificationStatus === IdentityVerification::STATUS_APPROVED,
                'message' => '本人確認・年齢確認の承認が必要です。',
            ],
        ];
    }

    public function isReadyToPublish(TherapistProfile $profile): bool
    {
        foreach ($this->requirements($profile) as $requirement) {
            if (! $requirement['is_satisfied']) {
                return false;
            }
        }

        return true;
    }

    public function refreshPublicationState(TherapistProfile $profile): TherapistProfile
    {
        $profile->loadMissing(['menus', 'account.latestIdentityVerification']);

        if ($profile->profile_status === TherapistProfile::STATUS_SUSPENDED) {
            $profile->forceFill([
                'is_online' => false,
                'online_since' => null,
            ])->save();

            return $profile->refresh();
        }

        $isReadyToPublish = $this->isReadyToPublish($profile);
        $nextStatus = $isReadyToPublish
            ? TherapistProfile::STATUS_APPROVED
            : TherapistProfile::STATUS_DRAFT;

        $attributes = [
            'profile_status' => $nextStatus,
            'rejected_reason_code' => null,
        ];

        if ($nextStatus === TherapistProfile::STATUS_APPROVED) {
            $attributes['approved_at'] = $profile->approved_at ?? now();
        } else {
            $attributes['is_online'] = false;
            $attributes['online_since'] = null;
            $attributes['approved_at'] = null;
            $attributes['approved_by_account_id'] = null;
        }

        $profile->forceFill($attributes)->save();

        return $profile->refresh();
    }
}
