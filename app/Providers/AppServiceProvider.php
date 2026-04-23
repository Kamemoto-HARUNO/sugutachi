<?php

namespace App\Providers;

use App\Contracts\Payments\PaymentIntentGateway;
use App\Contracts\Payments\PayoutGateway;
use App\Contracts\Payments\RefundGateway;
use App\Services\Payments\StripePaymentIntentGateway;
use App\Services\Payments\StripePayoutGateway;
use App\Services\Payments\StripeRefundGateway;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(PaymentIntentGateway::class, StripePaymentIntentGateway::class);
        $this->app->bind(RefundGateway::class, StripeRefundGateway::class);
        $this->app->bind(PayoutGateway::class, StripePayoutGateway::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
