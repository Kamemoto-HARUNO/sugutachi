<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\MeProfileResource;
use App\Models\Account;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

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
            'phone_e164' => ['sometimes', 'nullable', 'string', 'max:32', 'regex:/^(\+[1-9]\d{7,14}|0\d{9,10})$/'],
        ]);

        $attributes = [];

        if (array_key_exists('display_name', $validated)) {
            $attributes['display_name'] = $validated['display_name'];
        }

        if (array_key_exists('phone_e164', $validated)) {
            $normalizedPhone = $this->normalizePhoneNumber($validated['phone_e164']);

            if ($normalizedPhone !== null) {
                $duplicatePhoneExists = Account::query()
                    ->where('phone_e164', $normalizedPhone)
                    ->whereKeyNot($account->id)
                    ->exists();

                if ($duplicatePhoneExists) {
                    throw ValidationException::withMessages([
                        'phone_e164' => ['その電話番号はすでに使われています。'],
                    ]);
                }
            }

            $attributes['phone_e164'] = $normalizedPhone;

            if ($normalizedPhone !== $account->phone_e164) {
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

    private function normalizePhoneNumber(?string $value): ?string
    {
        if ($value === null || trim($value) === '') {
            return null;
        }

        $trimmed = trim($value);

        if (str_starts_with($trimmed, '+')) {
            return $trimmed;
        }

        $digits = preg_replace('/\D+/', '', $trimmed) ?? '';

        if (preg_match('/^0\d{9,10}$/', $digits) !== 1) {
            throw ValidationException::withMessages([
                'phone_e164' => ['電話番号は 08012345678 のように、先頭の 0 を含む数字だけで入力してください。'],
            ]);
        }

        return '+81'.substr($digits, 1);
    }
}
