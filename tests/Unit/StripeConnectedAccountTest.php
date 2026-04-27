<?php

namespace Tests\Unit;

use App\Models\StripeConnectedAccount;
use Tests\TestCase;

class StripeConnectedAccountTest extends TestCase
{
    public function test_preview_account_id_is_not_used_for_transfers_in_testing(): void
    {
        $connectedAccount = new StripeConnectedAccount([
            'stripe_account_id' => 'acct_preview_thera',
            'charges_enabled' => true,
        ]);

        $this->assertFalse($connectedAccount->canReceiveStripeTransfers());
    }

    public function test_real_connected_account_can_receive_transfers_when_enabled(): void
    {
        $connectedAccount = new StripeConnectedAccount([
            'stripe_account_id' => 'acct_1TestRealDestination',
            'charges_enabled' => true,
        ]);

        $this->assertTrue($connectedAccount->canReceiveStripeTransfers());
    }

    public function test_disabled_connected_account_cannot_receive_transfers(): void
    {
        $connectedAccount = new StripeConnectedAccount([
            'stripe_account_id' => 'acct_1TestRealDestination',
            'charges_enabled' => false,
        ]);

        $this->assertFalse($connectedAccount->canReceiveStripeTransfers());
    }
}
