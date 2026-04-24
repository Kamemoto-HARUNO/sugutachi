<?php

namespace App\Services\Payments;

use App\Contracts\Payments\ConnectGateway;
use App\Contracts\Payments\CreatedAccountLink;
use App\Models\Account;
use Carbon\CarbonImmutable;
use RuntimeException;
use Stripe\StripeClient;

class StripeConnectGateway implements ConnectGateway
{
    public function createAccount(Account $account): array
    {
        $stripeAccount = $this->client()->accounts->create(array_filter([
            'type' => 'express',
            'country' => config('services.stripe.connect_country', 'JP'),
            'email' => $account->email,
            'business_type' => 'individual',
            'capabilities' => [
                'card_payments' => ['requested' => true],
                'transfers' => ['requested' => true],
            ],
            'settings' => [
                'payouts' => [
                    'schedule' => [
                        'interval' => 'manual',
                    ],
                ],
            ],
            'business_profile' => filled(config('app.url'))
                ? ['url' => rtrim((string) config('app.url'), '/')]
                : null,
            'metadata' => [
                'account_id' => (string) $account->id,
                'account_public_id' => (string) $account->public_id,
            ],
        ], fn (mixed $value): bool => $value !== null));

        return $stripeAccount->toArray();
    }

    public function retrieveAccount(string $stripeAccountId): array
    {
        return $this->client()->accounts->retrieve($stripeAccountId, [])->toArray();
    }

    public function createAccountLink(
        string $stripeAccountId,
        string $refreshUrl,
        string $returnUrl,
    ): CreatedAccountLink {
        $accountLink = $this->client()->accountLinks->create([
            'account' => $stripeAccountId,
            'refresh_url' => $refreshUrl,
            'return_url' => $returnUrl,
            'type' => 'account_onboarding',
        ]);

        return new CreatedAccountLink(
            url: $accountLink->url,
            expiresAt: CarbonImmutable::createFromTimestampUTC((int) $accountLink->expires_at)
                ->setTimezone(config('app.timezone', 'UTC')),
        );
    }

    private function client(): StripeClient
    {
        $secret = config('services.stripe.secret');

        if (! $secret) {
            throw new RuntimeException('Stripe secret key is not configured.');
        }

        return new StripeClient($secret);
    }
}
