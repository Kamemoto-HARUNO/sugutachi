<?php

namespace Tests\Feature;

use App\Models\Account;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class IdentityVerificationApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_account_can_upload_temp_files_and_submit_identity_verification(): void
    {
        Storage::fake('local');

        $account = Account::factory()->create();
        $token = $account->createToken('api')->plainTextToken;

        $documentFileId = $this->withToken($token)
            ->post('/api/temp-files', [
                'purpose' => 'identity_document',
                'file' => UploadedFile::fake()->create('document.pdf', 128, 'application/pdf'),
            ])
            ->assertCreated()
            ->assertJsonPath('data.purpose', 'identity_document')
            ->json('data.file_id');

        $selfieFileId = $this->withToken($token)
            ->post('/api/temp-files', [
                'purpose' => 'selfie',
                'file' => UploadedFile::fake()->create('selfie.jpg', 128, 'image/jpeg'),
            ])
            ->assertCreated()
            ->assertJsonPath('data.purpose', 'selfie')
            ->json('data.file_id');

        $this->withToken($token)
            ->postJson('/api/me/identity-verification', [
                'full_name' => 'Test User',
                'birthdate' => '1990-01-01',
                'self_declared_male' => true,
                'document_type' => 'driver_license',
                'document_last4' => '1234',
                'document_file_id' => $documentFileId,
                'selfie_file_id' => $selfieFileId,
            ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.birth_year', 1990)
            ->assertJsonPath('data.self_declared_male', true)
            ->assertJsonPath('data.is_age_verified', false);

        $this->assertDatabaseHas('identity_verifications', [
            'account_id' => $account->id,
            'status' => 'pending',
            'birth_year' => 1990,
            'self_declared_male' => true,
        ]);

        $this->assertDatabaseHas('temp_files', [
            'file_id' => $documentFileId,
            'status' => 'used',
        ]);

        $this->assertDatabaseHas('temp_files', [
            'file_id' => $selfieFileId,
            'status' => 'used',
        ]);

        $this->withToken($token)
            ->getJson('/api/me/identity-verification')
            ->assertOk()
            ->assertJsonPath('data.status', 'pending');
    }
}
