<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\IdentityVerificationController;
use App\Http\Controllers\Api\TempFileController;
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
});
