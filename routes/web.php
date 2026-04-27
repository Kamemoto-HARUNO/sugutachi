<?php

use App\Http\Controllers\Api\StripeWebhookController;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Support\Facades\Route;

Route::post('/webhooks/stripe', StripeWebhookController::class)
    ->withoutMiddleware(PreventRequestForgery::class);

Route::view('/{path?}', 'app')
    ->where('path', '^(?!api(?:/|$)|webhooks/stripe$).*$');
