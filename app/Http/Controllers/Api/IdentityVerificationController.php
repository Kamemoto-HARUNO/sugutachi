<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\IdentityVerificationResource;
use App\Models\IdentityVerification;
use App\Models\TempFile;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class IdentityVerificationController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        return $this->submit($request);
    }

    public function resubmit(Request $request): JsonResponse
    {
        return $this->submit($request, requiresRejectedLatest: true);
    }

    public function latest(Request $request): IdentityVerificationResource
    {
        $verification = $request->user()
            ->identityVerifications()
            ->latest('submitted_at')
            ->firstOrFail();

        return new IdentityVerificationResource($verification);
    }

    private function submit(Request $request, bool $requiresRejectedLatest = false): JsonResponse
    {
        $oldestAllowedBirthdate = now()->subYears(18)->toDateString();

        $validated = $request->validate([
            'full_name' => ['required', 'string', 'max:120'],
            'birthdate' => ['required', 'date', 'before_or_equal:'.$oldestAllowedBirthdate],
            'self_declared_male' => ['accepted'],
            'document_type' => ['required', Rule::in(['driver_license', 'passport', 'my_number_card', 'residence_card', 'other'])],
            'document_last4' => ['nullable', 'string', 'max:16'],
            'document_file_id' => ['required', 'string', 'max:64'],
            'selfie_file_id' => ['required', 'string', 'max:64'],
        ]);

        $account = $request->user();
        $latestVerification = $account->identityVerifications()->latest('submitted_at')->first();

        if ($requiresRejectedLatest) {
            abort_unless(
                $latestVerification?->status === IdentityVerification::STATUS_REJECTED,
                409,
                'Only rejected identity verifications can be resubmitted.'
            );
        }

        $documentFile = $this->findUsableTempFile($validated['document_file_id'], $account->id, 'identity_document');
        $selfieFile = $this->findUsableTempFile($validated['selfie_file_id'], $account->id, 'selfie');
        $birthdate = CarbonImmutable::parse($validated['birthdate']);

        $verification = DB::transaction(function () use ($account, $birthdate, $documentFile, $selfieFile, $validated): IdentityVerification {
            $verification = IdentityVerification::create([
                'account_id' => $account->id,
                'provider' => 'manual',
                'status' => IdentityVerification::STATUS_PENDING,
                'full_name_encrypted' => Crypt::encryptString($validated['full_name']),
                'birthdate_encrypted' => Crypt::encryptString($birthdate->toDateString()),
                'birth_year' => $birthdate->year,
                'is_age_verified' => false,
                'self_declared_male' => true,
                'document_type' => $validated['document_type'],
                'document_last4_hash' => isset($validated['document_last4'])
                    ? hash('sha256', $validated['document_last4'])
                    : null,
                'document_storage_key_encrypted' => $documentFile->storage_key_encrypted,
                'selfie_storage_key_encrypted' => $selfieFile->storage_key_encrypted,
                'submitted_at' => now(),
                'reviewed_by_account_id' => null,
                'reviewed_at' => null,
                'rejection_reason_code' => null,
                'purge_after' => now()->addDays(30),
            ]);

            TempFile::query()
                ->whereKey([$documentFile->id, $selfieFile->id])
                ->update([
                    'status' => 'used',
                    'used_at' => now(),
                    'updated_at' => now(),
                ]);

            return $verification;
        });

        return (new IdentityVerificationResource($verification))
            ->response()
            ->setStatusCode(201);
    }

    private function findUsableTempFile(string $fileId, int $accountId, string $purpose): TempFile
    {
        $file = TempFile::query()
            ->where('file_id', $fileId)
            ->where('account_id', $accountId)
            ->where('purpose', $purpose)
            ->where('status', 'uploaded')
            ->where('expires_at', '>', now())
            ->first();

        if (! $file) {
            throw ValidationException::withMessages([
                $purpose === 'selfie' ? 'selfie_file_id' : 'document_file_id' => 'The selected file is unavailable.',
            ]);
        }

        return $file;
    }
}
