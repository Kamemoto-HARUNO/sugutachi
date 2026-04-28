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
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class StripeConnectController extends Controller
{
    public function show(Request $request): StripeConnectedAccountResource
    {
        $this->therapistProfileFor($request);

        $connectedAccount = $request->user()->stripeConnectedAccount()->first();

        if ($connectedAccount?->usesManualBankTransfer()) {
            $connectedAccount = $connectedAccount->syncManualPayoutState();
        }

        return new StripeConnectedAccountResource(
            $connectedAccount
        );
    }

    public function update(Request $request): StripeConnectedAccountResource
    {
        $therapistProfile = $this->therapistProfileFor($request);
        $validated = $request->validate([
            'bank_name' => ['required', 'string', 'max:120'],
            'bank_branch_name' => ['required', 'string', 'max:120'],
            'bank_account_type' => ['required', Rule::in(['ordinary', 'checking', 'savings'])],
            'bank_account_number' => ['required', 'regex:/^[0-9]{4,8}$/'],
            'bank_account_holder_name' => ['required', 'string', 'max:120'],
        ], [
            'bank_name.required' => '銀行名を入力してください。',
            'bank_branch_name.required' => '支店名を入力してください。',
            'bank_account_type.required' => '口座種別を選択してください。',
            'bank_account_type.in' => '口座種別を正しく選択してください。',
            'bank_account_number.required' => '口座番号を入力してください。',
            'bank_account_number.regex' => '口座番号は数字4〜8桁で入力してください。',
            'bank_account_holder_name.required' => '口座名義を入力してください。',
        ]);

        $connectedAccount = DB::transaction(function () use ($request, $therapistProfile, $validated): StripeConnectedAccount {
            $connectedAccount = StripeConnectedAccount::query()
                ->where('account_id', $request->user()->id)
                ->lockForUpdate()
                ->first();

            if (! $connectedAccount) {
                $connectedAccount = StripeConnectedAccount::create([
                    'account_id' => $request->user()->id,
                    'therapist_profile_id' => $therapistProfile->id,
                    'stripe_account_id' => $this->manualPlaceholderStripeAccountId($request->user()->id),
                    'account_type' => StripeConnectedAccount::ACCOUNT_TYPE_MANUAL,
                    'payout_method' => StripeConnectedAccount::PAYOUT_METHOD_MANUAL_BANK_TRANSFER,
                    'status' => StripeConnectedAccount::STATUS_PENDING,
                ]);
            } elseif ($connectedAccount->therapist_profile_id !== $therapistProfile->id) {
                $connectedAccount->forceFill([
                    'therapist_profile_id' => $therapistProfile->id,
                ])->save();
            }

            $connectedAccount->forceFill([
                'payout_method' => StripeConnectedAccount::PAYOUT_METHOD_MANUAL_BANK_TRANSFER,
                'account_type' => StripeConnectedAccount::ACCOUNT_TYPE_MANUAL,
                'bank_name' => trim($validated['bank_name']),
                'bank_branch_name' => trim($validated['bank_branch_name']),
                'bank_account_type' => $validated['bank_account_type'],
                'bank_account_number' => $validated['bank_account_number'],
                'bank_account_holder_name' => trim($validated['bank_account_holder_name']),
            ])->save();

            return $connectedAccount->syncManualPayoutState();
        });

        return new StripeConnectedAccountResource($connectedAccount);
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

        if ($connectedAccount->usesManualBankTransfer()) {
            return new StripeConnectedAccountResource($connectedAccount->syncManualPayoutState());
        }

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
        return $request->user()->ensureTherapistProfile();
    }

    private function connectedAccountFor(Request $request): StripeConnectedAccount
    {
        $this->therapistProfileFor($request);

        $connectedAccount = $request->user()->stripeConnectedAccount()->first();

        abort_unless($connectedAccount, 409, 'Stripe Connected Account is missing.');

        return $connectedAccount;
    }

    private function manualPlaceholderStripeAccountId(int $accountId): string
    {
        return sprintf('manual_%d_%s', $accountId, Str::lower((string) Str::ulid()));
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
                $parsed = parse_url($configuredUrl);
                $host = strtolower((string) ($parsed['host'] ?? ''));
                $path = (string) ($parsed['path'] ?? $fallbackPath);
                $query = isset($parsed['query']) ? '?'.$parsed['query'] : '';
                $fragment = isset($parsed['fragment']) ? '#'.$parsed['fragment'] : '';

                if ($this->isLocalOnlyHost($host)) {
                    return $this->localRedirectBaseUrl($request) . ($path !== '' ? $path : $fallbackPath) . $query . $fragment;
                }

                return $configuredUrl;
            }

            if (str_starts_with($configuredUrl, '/')) {
                return $this->localRedirectBaseUrl($request) . $configuredUrl;
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

        return $this->localRedirectBaseUrl($request) . $fallbackPath;
    }

    private function isLocalOnlyHost(string $host): bool
    {
        if ($host === '' || $host === 'localhost') {
            return true;
        }

        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            return true;
        }

        return ! str_contains($host, '.');
    }

    private function localRedirectBaseUrl(Request $request): string
    {
        $port = $request->getPort();
        $portSuffix = $port && ! in_array($port, [80, 443], true) ? ':'.$port : '';

        return $request->getScheme().'://127.0.0.1'.$portSuffix;
    }
}
