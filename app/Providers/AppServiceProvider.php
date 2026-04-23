<?php

namespace App\Providers;

use App\Contracts\Payments\PaymentIntentGateway;
use App\Services\Payments\StripePaymentIntentGateway;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(PaymentIntentGateway::class, StripePaymentIntentGateway::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
