<?php

use App\Http\Controllers\Api\StripeWebhookController;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::post('/webhooks/stripe', StripeWebhookController::class)
    ->withoutMiddleware(ValidateCsrfToken::class);
