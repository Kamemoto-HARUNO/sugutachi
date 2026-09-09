<?php

namespace Tests\Unit;

use App\Models\StripeConnectedAccount;
use Tests\TestCase;

class StripeConnectedAccountTest extends TestCase
{
    public function test_manual_or_unspecified_payout_method_cannot_receive_stripe_transfers(): void
    {
        foreach ([StripeConnectedAccount::PAYOUT_METHOD_MANUAL_BANK_TRANSFER, null] as $method) {
            $connectedAccount = new StripeConnectedAccount([
                'stripe_account_id' => 'acct_1TestRealDestination',
                'payout_method' => $method,
                'charges_enabled' => true,
            ]);

            $this->assertFalse($connectedAccount->canReceiveStripeTransfers());
        }
    }

    public function test_preview_account_id_is_not_used_for_transfers_in_testing(): void
    {
        $connectedAccount = new StripeConnectedAccount([
            'stripe_account_id' => 'acct_preview_thera',
            'payout_method' => StripeConnectedAccount::PAYOUT_METHOD_STRIPE_CONNECT,
            'charges_enabled' => true,
        ]);

        $this->assertFalse($connectedAccount->canReceiveStripeTransfers());
    }

    public function test_real_connected_account_can_receive_transfers_when_enabled(): void
    {
        $connectedAccount = new StripeConnectedAccount([
            'stripe_account_id' => 'acct_1TestRealDestination',
            'payout_method' => StripeConnectedAccount::PAYOUT_METHOD_STRIPE_CONNECT,
            'charges_enabled' => true,
        ]);

        $this->assertTrue($connectedAccount->canReceiveStripeTransfers());
    }

    public function test_disabled_connected_account_cannot_receive_transfers(): void
    {
        $connectedAccount = new StripeConnectedAccount([
            'stripe_account_id' => 'acct_1TestRealDestination',
            'payout_method' => StripeConnectedAccount::PAYOUT_METHOD_STRIPE_CONNECT,
            'charges_enabled' => false,
        ]);

        $this->assertFalse($connectedAccount->canReceiveStripeTransfers());
    }
}
