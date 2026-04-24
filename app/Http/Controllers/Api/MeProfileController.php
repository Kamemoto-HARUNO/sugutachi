<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\MeProfileResource;
use Illuminate\Http\Request;

class MeProfileController extends Controller
{
    public function show(Request $request): MeProfileResource
    {
        return new MeProfileResource(
            $request->user()->load(['roleAssignments', 'latestIdentityVerification', 'profilePhotos.therapistProfile'])
        );
    }

    public function update(Request $request): MeProfileResource
    {
        $account = $request->user();
        $validated = $request->validate([
            'display_name' => ['sometimes', 'nullable', 'string', 'max:80'],
            'phone_e164' => ['sometimes', 'nullable', 'string', 'max:32', 'regex:/^\+[1-9]\d{7,14}$/', 'unique:accounts,phone_e164,'.$account->id],
        ]);

        $attributes = [];

        if (array_key_exists('display_name', $validated)) {
            $attributes['display_name'] = $validated['display_name'];
        }

        if (array_key_exists('phone_e164', $validated)) {
            $attributes['phone_e164'] = $validated['phone_e164'];

            if ($validated['phone_e164'] !== $account->phone_e164) {
                $attributes['phone_verified_at'] = null;
            }
        }

        if ($attributes !== []) {
            $account->forceFill($attributes)->save();
        }

        return new MeProfileResource(
            $account->fresh(['roleAssignments', 'latestIdentityVerification', 'profilePhotos.therapistProfile'])
        );
    }
}
