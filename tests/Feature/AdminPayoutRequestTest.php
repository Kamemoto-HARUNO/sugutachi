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
        [$admin, $payoutRequest, $ledgerEntry, $therapist, $connectedAccount] = $this->createAdminPayoutFixture();
        PayoutRequest::create([
            'public_id' => 'pay_admin_later',
            'therapist_account_id' => $therapist->id,
            'stripe_connected_account_id' => $connectedAccount->id,
            'status' => PayoutRequest::STATUS_REQUESTED,
            'requested_amount' => 20800,
            'net_amount' => 20800,
            'requested_at' => now()->subDays(2),
            'scheduled_process_date' => now()->addDay(),
        ]);
        $token = $admin->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->getJson("/api/admin/payout-requests?status=payout_requested&therapist_account_id={$therapist->public_id}&scheduled_from=".now()->subDay()->toDateString().'&sort=scheduled_process_date&direction=asc')
            ->assertOk()
            ->assertJsonCount(2, 'data')
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

    public function test_admin_can_mark_manual_payout_request_as_paid_without_stripe_gateway(): void
    {
        [$admin, $payoutRequest, $ledgerEntry] = $this->createAdminPayoutFixture(manual: true);

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->postJson("/api/admin/payout-requests/{$payoutRequest->public_id}/process")
            ->assertOk()
            ->assertJsonPath('data.status', PayoutRequest::STATUS_PAID)
            ->assertJsonPath('data.stripe_payout_id', null);

        $this->assertDatabaseHas('payout_requests', [
            'id' => $payoutRequest->id,
            'status' => PayoutRequest::STATUS_PAID,
            'stripe_payout_id' => null,
            'reviewed_by_account_id' => $admin->id,
        ]);
        $this->assertSame(TherapistLedgerEntry::STATUS_PAID, $ledgerEntry->refresh()->status);
    }

    public function test_non_admin_cannot_access_payout_admin_api(): void
    {
        [, $payoutRequest, , $therapist] = $this->createAdminPayoutFixture();

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->postJson("/api/admin/payout-requests/{$payoutRequest->public_id}/hold")
            ->assertForbidden();
    }

    private function createAdminPayoutFixture(bool $manual = false): array
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
            'stripe_account_id' => $manual ? 'manual_admin_payout' : 'acct_admin_payout',
            'account_type' => $manual ? StripeConnectedAccount::ACCOUNT_TYPE_MANUAL : 'express',
            'payout_method' => $manual
                ? StripeConnectedAccount::PAYOUT_METHOD_MANUAL_BANK_TRANSFER
                : StripeConnectedAccount::PAYOUT_METHOD_STRIPE_CONNECT,
            'status' => StripeConnectedAccount::STATUS_ACTIVE,
            'charges_enabled' => ! $manual,
            'payouts_enabled' => true,
            'details_submitted' => true,
            'bank_name' => $manual ? '三井住友銀行' : null,
            'bank_branch_name' => $manual ? '新宿支店' : null,
            'bank_account_type' => $manual ? 'ordinary' : null,
            'bank_account_number' => $manual ? '1234567' : null,
            'bank_account_holder_name' => $manual ? 'ヤマダ タロウ' : null,
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

        return [$admin, $payoutRequest, $ledgerEntry, $therapist, $connectedAccount];
    }
}
