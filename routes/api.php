<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BookingCancellationController;
use App\Http\Controllers\Api\BookingController;
use App\Http\Controllers\Api\BookingMessageController;
use App\Http\Controllers\Api\BookingQuoteController;
use App\Http\Controllers\Api\BookingStatusController;
use App\Http\Controllers\Api\IdentityVerificationController;
use App\Http\Controllers\Api\PaymentIntentController;
use App\Http\Controllers\Api\PaymentSyncController;
use App\Http\Controllers\Api\RefundRequestController;
use App\Http\Controllers\Api\ServiceAddressController;
use App\Http\Controllers\Api\StripeWebhookController;
use App\Http\Controllers\Api\TempFileController;
use App\Http\Controllers\Api\TherapistMenuController;
use App\Http\Controllers\Api\TherapistProfileController;
use Illuminate\Support\Facades\Route;

Route::post('/webhooks/stripe', StripeWebhookController::class);

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
    Route::get('/me/therapist/booking-requests', [BookingController::class, 'therapistRequests']);
    Route::get('/bookings', [BookingController::class, 'index']);
    Route::post('/bookings', [BookingController::class, 'store']);
    Route::get('/bookings/{booking:public_id}', [BookingController::class, 'show']);
    Route::post('/bookings/{booking:public_id}/payment-intents', [PaymentIntentController::class, 'store']);
    Route::post('/bookings/{booking:public_id}/payment-sync', [PaymentSyncController::class, 'store']);
    Route::post('/bookings/{booking:public_id}/cancel-preview', [BookingCancellationController::class, 'preview']);
    Route::post('/bookings/{booking:public_id}/cancel', [BookingCancellationController::class, 'store']);
    Route::get('/bookings/{booking:public_id}/refund-requests', [RefundRequestController::class, 'index']);
    Route::post('/bookings/{booking:public_id}/refund-requests', [RefundRequestController::class, 'store']);
    Route::get('/bookings/{booking:public_id}/messages', [BookingMessageController::class, 'index']);
    Route::post('/bookings/{booking:public_id}/messages', [BookingMessageController::class, 'store']);
    Route::post('/bookings/{booking:public_id}/messages/{message}/read', [BookingMessageController::class, 'read']);
    Route::get('/refund-requests/{refund:public_id}', [RefundRequestController::class, 'show']);
    Route::post('/bookings/{booking:public_id}/accept', [BookingStatusController::class, 'accept']);
    Route::post('/bookings/{booking:public_id}/reject', [BookingStatusController::class, 'reject']);
    Route::post('/bookings/{booking:public_id}/moving', [BookingStatusController::class, 'moving']);
    Route::post('/bookings/{booking:public_id}/arrived', [BookingStatusController::class, 'arrived']);
    Route::post('/bookings/{booking:public_id}/start', [BookingStatusController::class, 'start']);
    Route::post('/bookings/{booking:public_id}/complete', [BookingStatusController::class, 'complete']);
    Route::post('/bookings/{booking:public_id}/user-complete-confirmation', [BookingStatusController::class, 'userCompleteConfirmation']);
});
