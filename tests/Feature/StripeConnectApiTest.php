<?php

namespace Tests\Feature;

use App\Contracts\Payments\ConnectGateway;
use App\Contracts\Payments\CreatedAccountLink;
use App\Models\Account;
use App\Models\StripeConnectedAccount;
use App\Models\TherapistProfile;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StripeConnectApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_therapist_can_get_empty_stripe_connect_status(): void
    {
        [$therapist, $token] = $this->createTherapistFixture();

        $this->withToken($token)
            ->getJson('/api/me/stripe-connect')
            ->assertOk()
            ->assertJsonPath('data.has_account', false)
            ->assertJsonPath('data.stripe_account_id', null)
            ->assertJsonPath('data.status', null)
            ->assertJsonPath('data.charges_enabled', false)
            ->assertJsonPath('data.payouts_enabled', false)
            ->assertJsonPath('data.details_submitted', false)
            ->assertJsonPath('data.requirements_currently_due', [])
            ->assertJsonPath('data.requirements_past_due', []);

        $this->assertDatabaseMissing('stripe_connected_accounts', [
            'account_id' => $therapist->id,
        ]);
    }

    public function test_therapist_can_create_connected_account(): void
    {
        [$therapist, $token] = $this->createTherapistFixture();

        $gateway = new FakeConnectGateway;
        $gateway->createdAccount = [
            'id' => 'acct_connect_created',
            'type' => 'express',
            'charges_enabled' => false,
            'payouts_enabled' => false,
            'details_submitted' => false,
            'requirements' => [
                'currently_due' => ['individual.first_name', 'external_account'],
                'past_due' => [],
                'disabled_reason' => null,
            ],
        ];
        $this->app->instance(ConnectGateway::class, $gateway);

        $this->withToken($token)
            ->postJson('/api/me/stripe-connect/accounts')
            ->assertCreated()
            ->assertJsonPath('data.has_account', true)
            ->assertJsonPath('data.stripe_account_id', 'acct_connect_created')
            ->assertJsonPath('data.account_type', 'express')
            ->assertJsonPath('data.status', StripeConnectedAccount::STATUS_REQUIREMENTS_DUE)
            ->assertJsonPath('data.requirements_currently_due', ['individual.first_name', 'external_account']);

        $this->assertSame(1, $gateway->createAccountCalls);
        $this->assertDatabaseHas('stripe_connected_accounts', [
            'account_id' => $therapist->id,
            'therapist_profile_id' => $therapist->therapistProfile->id,
            'stripe_account_id' => 'acct_connect_created',
            'status' => StripeConnectedAccount::STATUS_REQUIREMENTS_DUE,
            'account_type' => 'express',
        ]);
    }

    public function test_create_connected_account_is_idempotent_when_account_already_exists(): void
    {
        [$therapist, $token] = $this->createTherapistFixture();

        StripeConnectedAccount::create([
            'account_id' => $therapist->id,
            'therapist_profile_id' => $therapist->therapistProfile->id,
            'stripe_account_id' => 'acct_existing',
            'account_type' => 'express',
            'status' => StripeConnectedAccount::STATUS_ACTIVE,
            'charges_enabled' => true,
            'payouts_enabled' => true,
            'details_submitted' => true,
            'onboarding_completed_at' => now()->subDay(),
            'last_synced_at' => now()->subHour(),
        ]);

        $gateway = new FakeConnectGateway;
        $this->app->instance(ConnectGateway::class, $gateway);

        $this->withToken($token)
            ->postJson('/api/me/stripe-connect/accounts')
            ->assertOk()
            ->assertJsonPath('data.has_account', true)
            ->assertJsonPath('data.stripe_account_id', 'acct_existing')
            ->assertJsonPath('data.status', StripeConnectedAccount::STATUS_ACTIVE);

        $this->assertSame(0, $gateway->createAccountCalls);
        $this->assertDatabaseCount('stripe_connected_accounts', 1);
    }

    public function test_therapist_can_issue_account_onboarding_link(): void
    {
        [$therapist, $token] = $this->createTherapistFixture();

        StripeConnectedAccount::create([
            'account_id' => $therapist->id,
            'therapist_profile_id' => $therapist->therapistProfile->id,
            'stripe_account_id' => 'acct_link_target',
            'account_type' => 'express',
            'status' => StripeConnectedAccount::STATUS_REQUIREMENTS_DUE,
        ]);

        config()->set('services.stripe.connect_return_url', 'https://sugutachi.com/therapist/stripe-connect/return');
        config()->set('services.stripe.connect_refresh_url', 'https://sugutachi.com/therapist/stripe-connect/refresh');

        $gateway = new FakeConnectGateway;
        $gateway->accountLink = new CreatedAccountLink(
            url: 'https://connect.stripe.com/setup/s/test',
            expiresAt: CarbonImmutable::parse('2026-04-24 12:00:00'),
        );
        $this->app->instance(ConnectGateway::class, $gateway);

        $this->withToken($token)
            ->postJson('/api/me/stripe-connect/account-link')
            ->assertOk()
            ->assertJsonPath('data.url', 'https://connect.stripe.com/setup/s/test')
            ->assertJsonPath('data.type', 'account_onboarding');

        $this->assertSame(1, $gateway->createAccountLinkCalls);
        $this->assertSame('acct_link_target', $gateway->lastStripeAccountId);
        $this->assertSame('https://sugutachi.com/therapist/stripe-connect/refresh', $gateway->lastRefreshUrl);
        $this->assertSame('https://sugutachi.com/therapist/stripe-connect/return', $gateway->lastReturnUrl);
    }

    public function test_account_link_urls_are_normalized_when_configured_without_scheme(): void
    {
        [$therapist, $token] = $this->createTherapistFixture();

        StripeConnectedAccount::create([
            'account_id' => $therapist->id,
            'therapist_profile_id' => $therapist->therapistProfile->id,
            'stripe_account_id' => 'acct_link_target',
            'account_type' => 'express',
            'status' => StripeConnectedAccount::STATUS_REQUIREMENTS_DUE,
        ]);

        config()->set('services.stripe.connect_return_url', 'localhost/therapist/stripe-connect');
        config()->set('services.stripe.connect_refresh_url', 'localhost/therapist/stripe-connect');

        $gateway = new FakeConnectGateway;
        $this->app->instance(ConnectGateway::class, $gateway);

        $this->withServerVariables(['HTTP_HOST' => '127.0.0.1:8000'])
            ->withToken($token)
            ->postJson('/api/me/stripe-connect/account-link')
            ->assertOk();

        $this->assertSame('http://localhost/therapist/stripe-connect', $gateway->lastRefreshUrl);
        $this->assertSame('http://localhost/therapist/stripe-connect', $gateway->lastReturnUrl);
    }

    public function test_therapist_can_refresh_connected_account_state(): void
    {
        [$therapist, $token] = $this->createTherapistFixture();

        StripeConnectedAccount::create([
            'account_id' => $therapist->id,
            'therapist_profile_id' => $therapist->therapistProfile->id,
            'stripe_account_id' => 'acct_refresh_target',
            'account_type' => 'express',
            'status' => StripeConnectedAccount::STATUS_PENDING,
            'charges_enabled' => false,
            'payouts_enabled' => false,
            'details_submitted' => false,
        ]);

        $gateway = new FakeConnectGateway;
        $gateway->retrievedAccount = [
            'id' => 'acct_refresh_target',
            'type' => 'express',
            'charges_enabled' => true,
            'payouts_enabled' => true,
            'details_submitted' => true,
            'requirements' => [
                'currently_due' => [],
                'past_due' => [],
                'disabled_reason' => null,
            ],
        ];
        $this->app->instance(ConnectGateway::class, $gateway);

        $this->withToken($token)
            ->postJson('/api/me/stripe-connect/refresh')
            ->assertOk()
            ->assertJsonPath('data.status', StripeConnectedAccount::STATUS_ACTIVE)
            ->assertJsonPath('data.charges_enabled', true)
            ->assertJsonPath('data.payouts_enabled', true)
            ->assertJsonPath('data.details_submitted', true);

        $this->assertSame(1, $gateway->retrieveAccountCalls);
        $this->assertDatabaseHas('stripe_connected_accounts', [
            'account_id' => $therapist->id,
            'stripe_account_id' => 'acct_refresh_target',
            'status' => StripeConnectedAccount::STATUS_ACTIVE,
            'charges_enabled' => true,
            'payouts_enabled' => true,
            'details_submitted' => true,
        ]);
    }

    private function createTherapistFixture(): array
    {
        $therapist = Account::factory()->create([
            'public_id' => 'acc_therapist_connect',
            'email' => 'therapist@example.com',
        ]);
        TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_connect_api',
            'public_name' => 'Connect Therapist',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
        ]);

        return [$therapist->fresh('therapistProfile'), $therapist->createToken('api')->plainTextToken];
    }
}

class FakeConnectGateway implements ConnectGateway
{
    public int $createAccountCalls = 0;

    public int $retrieveAccountCalls = 0;

    public int $createAccountLinkCalls = 0;

    public array $createdAccount = [];

    public array $retrievedAccount = [];

    public ?CreatedAccountLink $accountLink = null;

    public ?string $lastStripeAccountId = null;

    public ?string $lastRefreshUrl = null;

    public ?string $lastReturnUrl = null;

    public function createAccount(Account $account): array
    {
        $this->createAccountCalls++;

        return $this->createdAccount;
    }

    public function retrieveAccount(string $stripeAccountId): array
    {
        $this->retrieveAccountCalls++;
        $this->lastStripeAccountId = $stripeAccountId;

        return $this->retrievedAccount;
    }

    public function createAccountLink(
        string $stripeAccountId,
        string $refreshUrl,
        string $returnUrl,
    ): CreatedAccountLink {
        $this->createAccountLinkCalls++;
        $this->lastStripeAccountId = $stripeAccountId;
        $this->lastRefreshUrl = $refreshUrl;
        $this->lastReturnUrl = $returnUrl;

        return $this->accountLink ?? new CreatedAccountLink(
            url: 'https://connect.stripe.com/setup/s/default',
            expiresAt: CarbonImmutable::parse('2026-04-24 12:00:00'),
        );
    }
}
