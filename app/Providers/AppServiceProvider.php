<?php

namespace App\Providers;

use App\Contracts\Payments\ConnectGateway;
use App\Contracts\Payments\PaymentIntentGateway;
use App\Contracts\Payments\PayoutGateway;
use App\Contracts\Payments\RefundGateway;
use App\Services\Payments\StripeConnectGateway;
use App\Services\Payments\StripePaymentIntentGateway;
use App\Services\Payments\StripePayoutGateway;
use App\Services\Payments\StripeRefundGateway;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(ConnectGateway::class, StripeConnectGateway::class);
        $this->app->bind(PaymentIntentGateway::class, StripePaymentIntentGateway::class);
        $this->app->bind(RefundGateway::class, StripeRefundGateway::class);
        $this->app->bind(PayoutGateway::class, StripePayoutGateway::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('therapist-search', function (Request $request): Limit {
            return Limit::perMinutes(10, 30)->by((string) ($request->user()?->id ?? $request->ip()));
        });
    }
}
