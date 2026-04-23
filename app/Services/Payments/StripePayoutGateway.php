<?php

namespace App\Services\Payments;

use App\Contracts\Payments\CreatedPayout;
use App\Contracts\Payments\PayoutGateway;
use App\Models\PayoutRequest;
use RuntimeException;
use Stripe\StripeClient;

class StripePayoutGateway implements PayoutGateway
{
    public function create(PayoutRequest $payoutRequest): CreatedPayout
    {
        $secret = config('services.stripe.secret');

        if (! $secret) {
            throw new RuntimeException('Stripe secret key is not configured.');
        }

        $payoutRequest->loadMissing('stripeConnectedAccount');
        $stripeAccountId = $payoutRequest->stripeConnectedAccount?->stripe_account_id;

        if (! $stripeAccountId) {
            throw new RuntimeException('Stripe Connected Account id is missing.');
        }

        $stripePayout = (new StripeClient($secret))->payouts->create([
            'amount' => $payoutRequest->net_amount,
            'currency' => config('services.stripe.currency', 'jpy'),
            'metadata' => [
                'payout_request_public_id' => $payoutRequest->public_id,
                'therapist_account_id' => (string) $payoutRequest->therapist_account_id,
            ],
        ], [
            'stripe_account' => $stripeAccountId,
        ]);

        return new CreatedPayout(
            id: $stripePayout->id,
            status: $stripePayout->status,
            failureReason: $stripePayout->failure_message ?? $stripePayout->failure_code ?? null,
        );
    }
}
