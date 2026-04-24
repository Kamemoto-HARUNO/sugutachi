<?php

namespace App\Contracts\Payments;

use App\Models\Account;

interface ConnectGateway
{
    public function createAccount(Account $account): array;

    public function retrieveAccount(string $stripeAccountId): array;

    public function createAccountLink(
        string $stripeAccountId,
        string $refreshUrl,
        string $returnUrl,
    ): CreatedAccountLink;
}
