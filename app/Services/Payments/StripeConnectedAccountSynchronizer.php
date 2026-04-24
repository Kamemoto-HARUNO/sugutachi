<?php

namespace App\Services\Payments;

use App\Models\StripeConnectedAccount;
use RuntimeException;

class StripeConnectedAccountSynchronizer
{
    public function syncFromStripeAccount(StripeConnectedAccount $connectedAccount, array $stripeAccount): StripeConnectedAccount
    {
        $stripeAccountId = (string) ($stripeAccount['id'] ?? '');

        if ($stripeAccountId === '') {
            throw new RuntimeException('Stripe account payload is missing an id.');
        }

        $requirements = is_array($stripeAccount['requirements'] ?? null)
            ? $stripeAccount['requirements']
            : [];
        $currentlyDue = $this->stringList($requirements['currently_due'] ?? []);
        $pastDue = $this->stringList($requirements['past_due'] ?? []);
        $disabledReason = filled($requirements['disabled_reason'] ?? null)
            ? (string) $requirements['disabled_reason']
            : null;
        $chargesEnabled = (bool) ($stripeAccount['charges_enabled'] ?? false);
        $payoutsEnabled = (bool) ($stripeAccount['payouts_enabled'] ?? false);
        $detailsSubmitted = (bool) ($stripeAccount['details_submitted'] ?? false);

        $connectedAccount->forceFill([
            'stripe_account_id' => $stripeAccountId,
            'account_type' => (string) ($stripeAccount['type'] ?? $connectedAccount->account_type ?? 'express'),
            'status' => $this->connectedAccountStatus(
                chargesEnabled: $chargesEnabled,
                payoutsEnabled: $payoutsEnabled,
                detailsSubmitted: $detailsSubmitted,
                currentlyDue: $currentlyDue,
                pastDue: $pastDue,
                disabledReason: $disabledReason,
            ),
            'charges_enabled' => $chargesEnabled,
            'payouts_enabled' => $payoutsEnabled,
            'details_submitted' => $detailsSubmitted,
            'requirements_currently_due_json' => $currentlyDue,
            'requirements_past_due_json' => $pastDue,
            'disabled_reason' => $disabledReason,
            'onboarding_completed_at' => $detailsSubmitted
                ? ($connectedAccount->onboarding_completed_at ?? now())
                : null,
            'last_synced_at' => now(),
        ])->save();

        return $connectedAccount->refresh();
    }

    private function connectedAccountStatus(
        bool $chargesEnabled,
        bool $payoutsEnabled,
        bool $detailsSubmitted,
        array $currentlyDue,
        array $pastDue,
        ?string $disabledReason,
    ): string {
        if ($disabledReason || $pastDue !== []) {
            return StripeConnectedAccount::STATUS_RESTRICTED;
        }

        if ($currentlyDue !== []) {
            return StripeConnectedAccount::STATUS_REQUIREMENTS_DUE;
        }

        if ($detailsSubmitted && $chargesEnabled && $payoutsEnabled) {
            return StripeConnectedAccount::STATUS_ACTIVE;
        }

        return StripeConnectedAccount::STATUS_PENDING;
    }

    private function stringList(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        return array_values(array_map('strval', $value));
    }
}
