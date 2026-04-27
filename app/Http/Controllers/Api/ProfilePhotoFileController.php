<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\IdentityVerification;
use App\Models\ProfilePhoto;
use App\Models\TherapistProfile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ProfilePhotoFileController extends Controller
{
    public function showOwned(Request $request, ProfilePhoto $profilePhoto): StreamedResponse
    {
        abort_unless($profilePhoto->account_id === $request->user()->id, 404);

        return $this->responseFor($profilePhoto, 'private, max-age=300');
    }

    public function showPublic(ProfilePhoto $profilePhoto): StreamedResponse
    {
        $profilePhoto->loadMissing('therapistProfile.account.latestIdentityVerification');

        abort_unless($profilePhoto->usage_type === 'therapist_profile', 404);
        abort_unless($profilePhoto->status === ProfilePhoto::STATUS_APPROVED, 404);

        $therapistProfile = $profilePhoto->therapistProfile;
        $account = $therapistProfile?->account;
        $identityVerification = $account?->latestIdentityVerification;

        abort_unless($therapistProfile?->profile_status === TherapistProfile::STATUS_APPROVED, 404);
        abort_unless($account?->status === Account::STATUS_ACTIVE, 404);
        abort_unless($identityVerification?->status === IdentityVerification::STATUS_APPROVED, 404);

        return $this->responseFor($profilePhoto, 'public, max-age=300');
    }

    private function responseFor(ProfilePhoto $profilePhoto, string $cacheControl): StreamedResponse
    {
        $path = Crypt::decryptString($profilePhoto->storage_key_encrypted);

        abort_unless(Storage::disk('local')->exists($path), 404);

        return Storage::disk('local')->response($path, headers: [
            'Cache-Control' => $cacheControl,
        ]);
    }
}
