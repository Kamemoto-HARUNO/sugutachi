<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\Booking;
use App\Models\IdentityVerification;
use App\Models\PayoutRequest;
use App\Models\ProfilePhoto;
use App\Models\Refund;
use App\Models\Report;
use App\Models\TherapistProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminDashboardController extends Controller
{
    use AuthorizesAdminRequests;

    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request->user());

        return response()->json([
            'data' => [
                'accounts' => [
                    'total' => Account::query()->count(),
                    'active' => Account::query()->where('status', Account::STATUS_ACTIVE)->count(),
                    'suspended' => Account::query()->where('status', Account::STATUS_SUSPENDED)->count(),
                ],
                'reviews' => [
                    'pending_identity_verifications' => IdentityVerification::query()
                        ->where('status', IdentityVerification::STATUS_PENDING)
                        ->count(),
                    'pending_therapist_profiles' => TherapistProfile::query()
                        ->where('profile_status', TherapistProfile::STATUS_PENDING)
                        ->count(),
                    'pending_profile_photos' => ProfilePhoto::query()
                        ->where('status', ProfilePhoto::STATUS_PENDING)
                        ->count(),
                ],
                'operations' => [
                    'open_reports' => Report::query()
                        ->where('status', Report::STATUS_OPEN)
                        ->count(),
                    'requested_refunds' => Refund::query()
                        ->where('status', Refund::STATUS_REQUESTED)
                        ->count(),
                    'requested_payouts' => PayoutRequest::query()
                        ->where('status', PayoutRequest::STATUS_REQUESTED)
                        ->count(),
                ],
                'bookings' => [
                    'requested' => Booking::query()->where('status', Booking::STATUS_REQUESTED)->count(),
                    'in_progress' => Booking::query()->where('status', Booking::STATUS_IN_PROGRESS)->count(),
                    'completed_today' => Booking::query()
                        ->where('status', Booking::STATUS_COMPLETED)
                        ->whereDate('updated_at', today())
                        ->count(),
                ],
            ],
        ]);
    }
}
