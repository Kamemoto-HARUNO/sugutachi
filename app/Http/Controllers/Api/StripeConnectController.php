<?php

namespace App\Http\Controllers\Api;

use App\Contracts\Payments\ConnectGateway;
use App\Http\Controllers\Controller;
use App\Http\Resources\StripeAccountLinkResource;
use App\Http\Resources\StripeConnectedAccountResource;
use App\Models\StripeConnectedAccount;
use App\Models\TherapistProfile;
use App\Services\Payments\StripeConnectedAccountSynchronizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class StripeConnectController extends Controller
{
    public function show(Request $request): StripeConnectedAccountResource
    {
        $this->therapistProfileFor($request);

        return new StripeConnectedAccountResource(
            $request->user()->stripeConnectedAccount()->first()
        );
    }

    public function createAccount(
        Request $request,
        ConnectGateway $gateway,
        StripeConnectedAccountSynchronizer $synchronizer,
    ): JsonResponse {
        $therapistProfile = $this->therapistProfileFor($request);
        $existingConnectedAccount = $request->user()->stripeConnectedAccount()->first();

        if ($existingConnectedAccount) {
            if ($existingConnectedAccount->therapist_profile_id !== $therapistProfile->id) {
                $existingConnectedAccount->forceFill([
                    'therapist_profile_id' => $therapistProfile->id,
                ])->save();
            }

            return (new StripeConnectedAccountResource($existingConnectedAccount->refresh()))
                ->response()
                ->setStatusCode(200);
        }

        $stripeAccount = $gateway->createAccount($request->user());

        $connectedAccount = DB::transaction(function () use ($request, $therapistProfile, $stripeAccount, $synchronizer): StripeConnectedAccount {
            $connectedAccount = StripeConnectedAccount::create([
                'account_id' => $request->user()->id,
                'therapist_profile_id' => $therapistProfile->id,
                'stripe_account_id' => (string) ($stripeAccount['id'] ?? ''),
                'account_type' => (string) ($stripeAccount['type'] ?? 'express'),
                'status' => StripeConnectedAccount::STATUS_PENDING,
            ]);

            return $synchronizer->syncFromStripeAccount($connectedAccount, $stripeAccount);
        });

        return (new StripeConnectedAccountResource($connectedAccount))
            ->response()
            ->setStatusCode(201);
    }

    public function createAccountLink(Request $request, ConnectGateway $gateway): StripeAccountLinkResource
    {
        $connectedAccount = $this->connectedAccountFor($request);
        $accountLink = $gateway->createAccountLink(
            stripeAccountId: $connectedAccount->stripe_account_id,
            refreshUrl: $this->connectRefreshUrl($request),
            returnUrl: $this->connectReturnUrl($request),
        );

        return new StripeAccountLinkResource((object) [
            'url' => $accountLink->url,
            'expires_at' => $accountLink->expiresAt,
            'type' => 'account_onboarding',
        ]);
    }

    public function refresh(
        Request $request,
        ConnectGateway $gateway,
        StripeConnectedAccountSynchronizer $synchronizer,
    ): StripeConnectedAccountResource {
        $connectedAccount = $this->connectedAccountFor($request);
        $stripeAccount = $gateway->retrieveAccount($connectedAccount->stripe_account_id);

        $connectedAccount = DB::transaction(function () use ($connectedAccount, $stripeAccount, $synchronizer): StripeConnectedAccount {
            $lockedConnectedAccount = StripeConnectedAccount::query()
                ->whereKey($connectedAccount->id)
                ->lockForUpdate()
                ->firstOrFail();

            return $synchronizer->syncFromStripeAccount($lockedConnectedAccount, $stripeAccount);
        });

        return new StripeConnectedAccountResource($connectedAccount);
    }

    private function therapistProfileFor(Request $request): TherapistProfile
    {
        return $request->user()->therapistProfile()->firstOrFail();
    }

    private function connectedAccountFor(Request $request): StripeConnectedAccount
    {
        $this->therapistProfileFor($request);

        $connectedAccount = $request->user()->stripeConnectedAccount()->first();

        abort_unless($connectedAccount, 409, 'Stripe Connected Account is missing.');

        return $connectedAccount;
    }

    private function connectReturnUrl(Request $request): string
    {
        return $this->resolveConnectUrl(
            $request,
            (string) config('services.stripe.connect_return_url'),
            '/therapist/stripe-connect',
        );
    }

    private function connectRefreshUrl(Request $request): string
    {
        return $this->resolveConnectUrl(
            $request,
            (string) config('services.stripe.connect_refresh_url'),
            '/therapist/stripe-connect',
        );
    }

    private function resolveConnectUrl(Request $request, string $configuredUrl, string $fallbackPath): string
    {
        $configuredUrl = trim($configuredUrl);

        if ($configuredUrl !== '') {
            if (filter_var($configuredUrl, FILTER_VALIDATE_URL)) {
                return $configuredUrl;
            }

            if (str_starts_with($configuredUrl, '/')) {
                return rtrim($request->getSchemeAndHttpHost(), '/') . $configuredUrl;
            }

            if (preg_match('/^[a-z0-9.-]+(?::\d+)?(?:\\/.*)?$/i', $configuredUrl) === 1) {
                [$host, $path] = array_pad(explode('/', $configuredUrl, 2), 2, '');

                if (strcasecmp($host, 'localhost') === 0) {
                    $path = $path !== '' ? '/' . ltrim($path, '/') : $fallbackPath;

                    return rtrim($request->getSchemeAndHttpHost(), '/') . $path;
                }

                return $request->getScheme() . '://' . ltrim($configuredUrl, '/');
            }
        }

        return rtrim($request->getSchemeAndHttpHost(), '/') . $fallbackPath;
    }
}
