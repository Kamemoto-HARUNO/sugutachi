<?php

use App\Http\Controllers\Api\StripeWebhookController;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Support\Facades\Route;

Route::post('/webhooks/stripe', StripeWebhookController::class)
    ->withoutMiddleware(ValidateCsrfToken::class);

Route::view('/{path?}', 'app')
    ->where('path', '^(?!api(?:/|$)|webhooks/stripe$).*$');
