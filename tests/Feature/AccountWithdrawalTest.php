<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Booking;
use App\Models\PayoutRequest;
use App\Models\ServiceAddress;
use App\Models\StripeConnectedAccount;
use App\Models\TherapistLedgerEntry;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccountWithdrawalTest extends TestCase
{
    use RefreshDatabase;

    public function test_account_can_view_withdrawal_summary(): void
    {
        [$account, $profile] = $this->createAccountFixture();

        TherapistLedgerEntry::create([
            'therapist_account_id' => $account->id,
            'entry_type' => TherapistLedgerEntry::TYPE_BOOKING_SALE,
            'amount_signed' => 9800,
            'status' => TherapistLedgerEntry::STATUS_AVAILABLE,
        ]);
        TherapistLedgerEntry::create([
            'therapist_account_id' => $account->id,
            'entry_type' => TherapistLedgerEntry::TYPE_CAMPAIGN_BONUS,
            'amount_signed' => 2000,
            'status' => TherapistLedgerEntry::STATUS_PENDING,
        ]);

        $response = $this->withToken($account->createToken('api')->plainTextToken)
            ->getJson('/api/me/withdrawal')
            ->assertOk()
            ->assertJsonPath('data.can_withdraw', true)
            ->assertJsonPath('data.remaining_balance_amount', 11800)
            ->assertJsonPath('data.balance.available_amount', 9800)
            ->assertJsonPath('data.balance.pending_amount', 2000)
            ->assertJsonCount(count(Account::withdrawalReasonOptions()), 'data.reason_options');

        $this->assertSame('approved', $profile->profile_status);
        $this->assertNotNull($response->json('data.reason_options.0.code'));
    }

    public function test_account_cannot_withdraw_when_blocking_booking_exists(): void
    {
        [$therapistAccount, $therapistProfile] = $this->createAccountFixture();
        $this->createBookingForTherapist($therapistAccount, $therapistProfile, Booking::STATUS_ACCEPTED);

        $this->withToken($therapistAccount->createToken('api')->plainTextToken)
            ->postJson('/api/me/withdrawal', [
                'reason_code' => Account::WITHDRAWAL_REASON_NOT_NEEDED,
            ])
            ->assertConflict()
            ->assertJsonPath('message', '進行中または未完了の予約があるため、いまは退会できません。');

        $this->assertDatabaseHas('accounts', [
            'id' => $therapistAccount->id,
            'status' => Account::STATUS_ACTIVE,
            'withdrawn_at' => null,
        ]);
    }

    public function test_account_cannot_withdraw_while_payout_is_processing(): void
    {
        [$account, $profile] = $this->createAccountFixture();

        PayoutRequest::create([
            'public_id' => 'pay_processing_withdrawal',
            'therapist_account_id' => $account->id,
            'stripe_connected_account_id' => $this->createConnectedAccount($account, $profile)->id,
            'status' => PayoutRequest::STATUS_PROCESSING,
            'requested_amount' => 9800,
            'net_amount' => 9800,
            'requested_at' => now()->subHour(),
            'processed_at' => now()->subMinutes(30),
            'scheduled_process_date' => now()->toDateString(),
        ]);

        $this->withToken($account->createToken('api')->plainTextToken)
            ->getJson('/api/me/withdrawal')
            ->assertOk()
            ->assertJsonPath('data.can_withdraw', false)
            ->assertJsonPath('data.has_processing_payout_request', true);

        $this->assertTrue($profile->is_listed);
    }

    public function test_account_can_withdraw_and_revoke_current_session(): void
    {
        [$account, $profile] = $this->createAccountFixture();
        $token = $account->createToken('api')->plainTextToken;
        $connectedAccount = $this->createConnectedAccount($account, $profile);

        $payoutRequest = PayoutRequest::create([
            'public_id' => 'pay_requested_withdrawal',
            'therapist_account_id' => $account->id,
            'stripe_connected_account_id' => $connectedAccount->id,
            'status' => PayoutRequest::STATUS_REQUESTED,
            'requested_amount' => 12000,
            'net_amount' => 12000,
            'requested_at' => now()->subHour(),
            'scheduled_process_date' => now()->addDay()->toDateString(),
        ]);

        TherapistLedgerEntry::create([
            'therapist_account_id' => $account->id,
            'payout_request_id' => $payoutRequest->id,
            'entry_type' => TherapistLedgerEntry::TYPE_BOOKING_SALE,
            'amount_signed' => 12000,
            'status' => TherapistLedgerEntry::STATUS_PAYOUT_REQUESTED,
        ]);
        TherapistLedgerEntry::create([
            'therapist_account_id' => $account->id,
            'entry_type' => TherapistLedgerEntry::TYPE_CAMPAIGN_BONUS,
            'amount_signed' => 3000,
            'status' => TherapistLedgerEntry::STATUS_AVAILABLE,
        ]);

        $this->withToken($token)
            ->postJson('/api/me/withdrawal', [
                'reason_code' => Account::WITHDRAWAL_REASON_HARD_TO_USE,
            ])
            ->assertOk()
            ->assertJsonPath('message', '退会が完了しました。');

        $this->assertDatabaseHas('accounts', [
            'id' => $account->id,
            'status' => Account::STATUS_WITHDRAWN,
            'withdrawal_reason_code' => Account::WITHDRAWAL_REASON_HARD_TO_USE,
        ]);
        $this->assertDatabaseHas('therapist_profiles', [
            'id' => $profile->id,
            'is_online' => false,
            'is_listed' => false,
        ]);
        $this->assertDatabaseHas('payout_requests', [
            'id' => $payoutRequest->id,
            'status' => PayoutRequest::STATUS_FAILED,
            'failure_reason' => 'account_withdrawn',
        ]);
        $this->assertDatabaseHas('therapist_ledger_entries', [
            'therapist_account_id' => $account->id,
            'status' => TherapistLedgerEntry::STATUS_HELD,
            'payout_request_id' => null,
        ]);
        $this->assertDatabaseMissing('personal_access_tokens', [
            'tokenable_id' => $account->id,
            'tokenable_type' => Account::class,
        ]);

        app('auth')->forgetGuards();

        $this->withToken($token)
            ->getJson('/api/me')
            ->assertUnauthorized();
    }

    private function createAccountFixture(): array
    {
        $account = Account::factory()->create([
            'public_id' => 'acc_withdrawal_target',
            'status' => Account::STATUS_ACTIVE,
            'last_active_role' => 'therapist',
        ]);

        $account->roleAssignments()->create([
            'role' => 'user',
            'status' => 'active',
            'granted_at' => now(),
        ]);
        $account->roleAssignments()->create([
            'role' => 'therapist',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        $profile = TherapistProfile::create([
            'account_id' => $account->id,
            'public_id' => 'thp_withdrawal_target',
            'public_name' => 'Withdrawal Therapist',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'is_online' => true,
            'is_listed' => true,
            'online_since' => now()->subMinutes(10),
        ]);

        return [$account, $profile];
    }

    private function createBookingForTherapist(Account $therapistAccount, TherapistProfile $therapistProfile, string $status): Booking
    {
        $user = Account::factory()->create(['public_id' => 'acc_withdrawal_user']);
        $user->roleAssignments()->create([
            'role' => 'user',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        $menu = TherapistMenu::create([
            'public_id' => 'menu_withdrawal_60',
            'therapist_profile_id' => $therapistProfile->id,
            'name' => 'Relax 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
        ]);

        $address = ServiceAddress::create([
            'public_id' => 'addr_withdrawal_user',
            'account_id' => $user->id,
            'place_type' => 'hotel',
            'address_line_encrypted' => 'encrypted-address',
            'lat' => '35.6812360',
            'lng' => '139.7671250',
        ]);

        return Booking::create([
            'public_id' => 'book_withdrawal_target',
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapistAccount->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $address->id,
            'status' => $status,
            'duration_minutes' => 60,
            'requested_start_at' => now()->addDay(),
            'scheduled_start_at' => now()->addDay(),
            'scheduled_end_at' => now()->addDay()->addHour(),
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);
    }

    private function createConnectedAccount(Account $account, TherapistProfile $profile): StripeConnectedAccount
    {
        return StripeConnectedAccount::create([
            'account_id' => $account->id,
            'therapist_profile_id' => $profile->id,
            'stripe_account_id' => 'acct_withdrawal_target',
            'account_type' => 'express',
            'status' => StripeConnectedAccount::STATUS_ACTIVE,
            'charges_enabled' => true,
            'payouts_enabled' => true,
            'details_submitted' => true,
        ]);
    }
}
