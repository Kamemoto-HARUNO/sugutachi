<?php

namespace Tests\Feature;

use App\Contracts\Payments\CreatedPayout;
use App\Contracts\Payments\PayoutGateway;
use App\Models\Account;
use App\Models\PayoutRequest;
use App\Models\StripeConnectedAccount;
use App\Models\TherapistLedgerEntry;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Assert;
use Tests\TestCase;

class AdminPayoutRequestTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_hold_and_release_payout_request(): void
    {
        [$admin, $payoutRequest, $ledgerEntry] = $this->createAdminPayoutFixture();
        $token = $admin->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/admin/payout-requests')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $payoutRequest->public_id);

        $this->withToken($token)
            ->postJson("/api/admin/payout-requests/{$payoutRequest->public_id}/hold")
            ->assertOk()
            ->assertJsonPath('data.status', PayoutRequest::STATUS_HELD);

        $this->assertSame(TherapistLedgerEntry::STATUS_HELD, $ledgerEntry->refresh()->status);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'payout.hold',
            'target_type' => PayoutRequest::class,
            'target_id' => $payoutRequest->id,
        ]);

        $this->withToken($token)
            ->postJson("/api/admin/payout-requests/{$payoutRequest->public_id}/release")
            ->assertOk()
            ->assertJsonPath('data.status', PayoutRequest::STATUS_REQUESTED);

        $this->assertSame(TherapistLedgerEntry::STATUS_PAYOUT_REQUESTED, $ledgerEntry->refresh()->status);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'payout.release',
            'target_type' => PayoutRequest::class,
            'target_id' => $payoutRequest->id,
        ]);
    }

    public function test_admin_can_process_due_payout_request_with_stripe_payout(): void
    {
        $this->app->bind(PayoutGateway::class, fn () => new class implements PayoutGateway
        {
            public function create(PayoutRequest $payoutRequest): CreatedPayout
            {
                Assert::assertSame('pay_admin', $payoutRequest->public_id);
                Assert::assertSame(10800, $payoutRequest->net_amount);
                Assert::assertSame('acct_admin_payout', $payoutRequest->stripeConnectedAccount->stripe_account_id);

                return new CreatedPayout(id: 'po_admin_123', status: 'pending');
            }
        });

        [$admin, $payoutRequest] = $this->createAdminPayoutFixture();

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->postJson("/api/admin/payout-requests/{$payoutRequest->public_id}/process")
            ->assertOk()
            ->assertJsonPath('data.status', PayoutRequest::STATUS_PROCESSING)
            ->assertJsonPath('data.stripe_payout_id', 'po_admin_123');

        $this->assertDatabaseHas('payout_requests', [
            'id' => $payoutRequest->id,
            'status' => PayoutRequest::STATUS_PROCESSING,
            'stripe_payout_id' => 'po_admin_123',
            'reviewed_by_account_id' => $admin->id,
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'payout.process',
            'target_type' => PayoutRequest::class,
            'target_id' => $payoutRequest->id,
        ]);
    }

    public function test_non_admin_cannot_access_payout_admin_api(): void
    {
        [, $payoutRequest, , $therapist] = $this->createAdminPayoutFixture();

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->postJson("/api/admin/payout-requests/{$payoutRequest->public_id}/hold")
            ->assertForbidden();
    }

    private function createAdminPayoutFixture(): array
    {
        $admin = Account::factory()->create(['public_id' => 'acc_admin_payout']);
        $admin->roleAssignments()->create([
            'role' => 'admin',
            'status' => 'active',
            'granted_at' => now(),
        ]);
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_admin_payout']);

        $therapistProfile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_admin_payout',
            'public_name' => 'Admin Payout Therapist',
            'profile_status' => 'approved',
        ]);

        $connectedAccount = StripeConnectedAccount::create([
            'account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'stripe_account_id' => 'acct_admin_payout',
            'account_type' => 'express',
            'status' => StripeConnectedAccount::STATUS_ACTIVE,
            'charges_enabled' => true,
            'payouts_enabled' => true,
            'details_submitted' => true,
        ]);

        $payoutRequest = PayoutRequest::create([
            'public_id' => 'pay_admin',
            'therapist_account_id' => $therapist->id,
            'stripe_connected_account_id' => $connectedAccount->id,
            'status' => PayoutRequest::STATUS_REQUESTED,
            'requested_amount' => 10800,
            'net_amount' => 10800,
            'requested_at' => now()->subDays(3),
            'scheduled_process_date' => now()->subDay(),
        ]);

        $ledgerEntry = TherapistLedgerEntry::create([
            'therapist_account_id' => $therapist->id,
            'payout_request_id' => $payoutRequest->id,
            'entry_type' => TherapistLedgerEntry::TYPE_BOOKING_SALE,
            'amount_signed' => 10800,
            'status' => TherapistLedgerEntry::STATUS_PAYOUT_REQUESTED,
        ]);

        return [$admin, $payoutRequest, $ledgerEntry, $therapist];
    }
}
