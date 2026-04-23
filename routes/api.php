<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BookingController;
use App\Http\Controllers\Api\BookingQuoteController;
use App\Http\Controllers\Api\IdentityVerificationController;
use App\Http\Controllers\Api\PaymentIntentController;
use App\Http\Controllers\Api\ServiceAddressController;
use App\Http\Controllers\Api\TempFileController;
use App\Http\Controllers\Api\TherapistMenuController;
use App\Http\Controllers\Api\TherapistProfileController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function (): void {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
});

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    Route::post('/temp-files', [TempFileController::class, 'store']);
    Route::delete('/temp-files/{tempFile:file_id}', [TempFileController::class, 'destroy']);

    Route::get('/me/identity-verification', [IdentityVerificationController::class, 'latest']);
    Route::post('/me/identity-verification', [IdentityVerificationController::class, 'store']);

    Route::get('/me/service-addresses', [ServiceAddressController::class, 'index']);
    Route::post('/me/service-addresses', [ServiceAddressController::class, 'store']);
    Route::get('/me/service-addresses/{serviceAddress:public_id}', [ServiceAddressController::class, 'show']);
    Route::delete('/me/service-addresses/{serviceAddress:public_id}', [ServiceAddressController::class, 'destroy']);

    Route::get('/me/therapist-profile', [TherapistProfileController::class, 'show']);
    Route::put('/me/therapist-profile', [TherapistProfileController::class, 'upsert']);
    Route::put('/me/therapist/location', [TherapistProfileController::class, 'updateLocation']);
    Route::get('/me/therapist/menus', [TherapistMenuController::class, 'index']);
    Route::post('/me/therapist/menus', [TherapistMenuController::class, 'store']);

    Route::post('/booking-quotes', [BookingQuoteController::class, 'store']);
    Route::get('/bookings', [BookingController::class, 'index']);
    Route::post('/bookings', [BookingController::class, 'store']);
    Route::get('/bookings/{booking:public_id}', [BookingController::class, 'show']);
    Route::post('/bookings/{booking:public_id}/payment-intents', [PaymentIntentController::class, 'store']);
});
