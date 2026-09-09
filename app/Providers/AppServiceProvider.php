<?php

namespace App\Providers;

use App\Contracts\Payments\ConnectGateway;
use App\Contracts\Payments\PaymentIntentGateway;
use App\Contracts\Payments\PaymentStateGateway;
use App\Contracts\Payments\PayoutGateway;
use App\Contracts\Payments\RefundGateway;
use App\Models\AppNotification;
use App\Observers\AppNotificationObserver;
use App\Services\Payments\LocalPaymentIntentGateway;
use App\Services\Payments\LocalPaymentSimulation;
use App\Services\Payments\LocalRefundGateway;
use App\Services\Payments\StripeConnectGateway;
use App\Services\Payments\StripePaymentIntentGateway;
use App\Services\Payments\StripePaymentStateGateway;
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
        $this->app->bind(PaymentStateGateway::class, fn ($app) => $app->make(
            $app->make(LocalPaymentSimulation::class)->enabled() ? LocalPaymentIntentGateway::class : StripePaymentStateGateway::class
        ));
        $this->app->bind(ConnectGateway::class, StripeConnectGateway::class);
        $this->app->bind(PaymentIntentGateway::class, fn ($app) => $app->make(
            $app->make(LocalPaymentSimulation::class)->enabled() ? LocalPaymentIntentGateway::class : StripePaymentIntentGateway::class
        ));
        $this->app->bind(RefundGateway::class, fn ($app) => $app->make(
            $app->make(LocalPaymentSimulation::class)->enabled() ? LocalRefundGateway::class : StripeRefundGateway::class
        ));
        $this->app->bind(PayoutGateway::class, StripePayoutGateway::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        AppNotification::observe(AppNotificationObserver::class);

        RateLimiter::for('therapist-search', function (Request $request): Limit {
            return Limit::perMinutes(10, 30)->by((string) ($request->user()?->id ?? $request->ip()));
        });
    }
}
