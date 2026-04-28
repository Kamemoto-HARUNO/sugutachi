<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\IdentityVerification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Tests\TestCase;

class AdminIdentityVerificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_and_approve_identity_verification(): void
    {
        [$admin, $verification, $user] = $this->createAdminIdentityFixture();
        IdentityVerification::create([
            'account_id' => Account::factory()->create(['public_id' => 'acc_other_identity'])->id,
            'provider' => 'manual',
            'status' => IdentityVerification::STATUS_APPROVED,
            'birth_year' => now()->subYears(22)->year,
            'is_age_verified' => true,
            'self_declared_male' => true,
            'document_type' => 'passport',
            'submitted_at' => now()->subMinutes(30),
            'reviewed_at' => now()->subMinutes(10),
        ]);
        $token = $admin->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->getJson("/api/admin/identity-verifications?status=pending&account_id={$user->public_id}&document_type=driver_license&sort=submitted_at&direction=asc")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $verification->id)
            ->assertJsonPath('data.0.account.public_id', $user->public_id)
            ->assertJson(fn ($json) => $json
                ->where('data.0.document_file_url', fn (?string $url) => is_string($url)
                    && str_contains($url, '/api/admin/identity-verifications/')
                    && str_contains($url, '/signed-document')
                    && str_contains($url, 'signature='))
                ->where('data.0.selfie_file_url', fn (?string $url) => is_string($url)
                    && str_contains($url, '/api/admin/identity-verifications/')
                    && str_contains($url, '/signed-selfie')
                    && str_contains($url, 'signature='))
                ->etc());

        $this->withToken($token)
            ->postJson("/api/admin/identity-verifications/{$verification->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', IdentityVerification::STATUS_APPROVED)
            ->assertJsonPath('data.is_age_verified', true)
            ->assertJsonPath('data.reviewed_by.public_id', $admin->public_id);

        $this->assertDatabaseHas('identity_verifications', [
            'id' => $verification->id,
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'reviewed_by_account_id' => $admin->id,
            'rejection_reason_code' => null,
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'identity_verification.approve',
            'target_type' => IdentityVerification::class,
            'target_id' => $verification->id,
        ]);
    }

    public function test_admin_can_reject_identity_verification(): void
    {
        [$admin, $verification] = $this->createAdminIdentityFixture();

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->postJson("/api/admin/identity-verifications/{$verification->id}/reject", [
                'rejection_reason_code' => 'document_unclear',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', IdentityVerification::STATUS_REJECTED)
            ->assertJsonPath('data.rejection_reason_code', 'document_unclear');

        $this->assertDatabaseHas('identity_verifications', [
            'id' => $verification->id,
            'status' => IdentityVerification::STATUS_REJECTED,
            'is_age_verified' => false,
            'reviewed_by_account_id' => $admin->id,
            'rejection_reason_code' => 'document_unclear',
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'identity_verification.reject',
            'target_type' => IdentityVerification::class,
            'target_id' => $verification->id,
        ]);
    }

    public function test_non_admin_cannot_review_identity_verification(): void
    {
        [, $verification, $user] = $this->createAdminIdentityFixture();

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/admin/identity-verifications/{$verification->id}/approve")
            ->assertForbidden();
    }

    private function createAdminIdentityFixture(): array
    {
        $admin = Account::factory()->create(['public_id' => 'acc_admin_identity']);
        $admin->roleAssignments()->create([
            'role' => 'admin',
            'status' => 'active',
            'granted_at' => now(),
        ]);
        $user = Account::factory()->create([
            'public_id' => 'acc_user_identity',
            'display_name' => 'Identity User',
        ]);

        $verification = IdentityVerification::create([
            'account_id' => $user->id,
            'provider' => 'manual',
            'status' => IdentityVerification::STATUS_PENDING,
            'birth_year' => now()->subYears(25)->year,
            'is_age_verified' => false,
            'self_declared_male' => true,
            'document_type' => 'driver_license',
            'document_storage_key_encrypted' => Crypt::encryptString('identity-verifications/documents/sample.pdf'),
            'selfie_storage_key_encrypted' => Crypt::encryptString('identity-verifications/selfies/sample.jpg'),
            'submitted_at' => now()->subHour(),
            'purge_after' => now()->addDays(30),
        ]);

        return [$admin, $verification, $user];
    }
}
