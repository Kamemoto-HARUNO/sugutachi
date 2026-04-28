<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\IdentityVerification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class IdentityVerificationPurgeCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_command_deletes_expired_identity_verification_files_and_clears_paths(): void
    {
        Storage::fake('local');

        $account = Account::factory()->create();
        $documentPath = 'identity/documents/test-front.jpg';
        $selfiePath = 'identity/selfies/test-selfie.jpg';

        Storage::disk('local')->put($documentPath, 'front');
        Storage::disk('local')->put($selfiePath, 'selfie');

        $verification = IdentityVerification::create([
            'account_id' => $account->id,
            'provider' => 'manual',
            'status' => IdentityVerification::STATUS_APPROVED,
            'document_storage_key_encrypted' => Crypt::encryptString($documentPath),
            'selfie_storage_key_encrypted' => Crypt::encryptString($selfiePath),
            'purge_after' => now()->subMinute(),
        ]);

        $this->artisan('identity-verifications:purge-files')
            ->expectsOutput('Purged identity verification files for 1 records.')
            ->assertSuccessful();

        Storage::disk('local')->assertMissing($documentPath);
        Storage::disk('local')->assertMissing($selfiePath);

        $verification->refresh();

        $this->assertNull($verification->document_storage_key_encrypted);
        $this->assertNull($verification->selfie_storage_key_encrypted);
    }

    public function test_command_keeps_non_expired_identity_verification_files(): void
    {
        Storage::fake('local');

        $account = Account::factory()->create();
        $documentPath = 'identity/documents/keep-front.jpg';
        $selfiePath = 'identity/selfies/keep-selfie.jpg';

        Storage::disk('local')->put($documentPath, 'front');
        Storage::disk('local')->put($selfiePath, 'selfie');

        IdentityVerification::create([
            'account_id' => $account->id,
            'provider' => 'manual',
            'status' => IdentityVerification::STATUS_PENDING,
            'document_storage_key_encrypted' => Crypt::encryptString($documentPath),
            'selfie_storage_key_encrypted' => Crypt::encryptString($selfiePath),
            'purge_after' => now()->addDay(),
        ]);

        $this->artisan('identity-verifications:purge-files')
            ->expectsOutput('Purged identity verification files for 0 records.')
            ->assertSuccessful();

        Storage::disk('local')->assertExists($documentPath);
        Storage::disk('local')->assertExists($selfiePath);
    }
}
