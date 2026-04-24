<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\Booking;
use App\Models\ContactInquiry;
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
                    'pending_contact_inquiries' => ContactInquiry::query()
                        ->where('status', ContactInquiry::STATUS_PENDING)
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
                'navigation' => [
                    'accounts' => [
                        'suspended' => [
                            'path' => '/api/admin/accounts',
                            'query' => [
                                'status' => Account::STATUS_SUSPENDED,
                                'sort' => 'created_at',
                                'direction' => 'desc',
                            ],
                        ],
                    ],
                    'reviews' => [
                        'pending_identity_verifications' => [
                            'path' => '/api/admin/identity-verifications',
                            'query' => [
                                'status' => IdentityVerification::STATUS_PENDING,
                                'sort' => 'submitted_at',
                                'direction' => 'asc',
                            ],
                        ],
                        'pending_therapist_profiles' => [
                            'path' => '/api/admin/therapist-profiles',
                            'query' => [
                                'status' => TherapistProfile::STATUS_PENDING,
                                'sort' => 'created_at',
                                'direction' => 'desc',
                            ],
                        ],
                        'pending_profile_photos' => [
                            'path' => '/api/admin/profile-photos',
                            'query' => [
                                'status' => ProfilePhoto::STATUS_PENDING,
                                'sort' => 'created_at',
                                'direction' => 'desc',
                            ],
                        ],
                    ],
                    'operations' => [
                        'open_reports' => [
                            'path' => '/api/admin/reports',
                            'query' => [
                                'status' => Report::STATUS_OPEN,
                                'sort' => 'created_at',
                                'direction' => 'desc',
                            ],
                        ],
                        'pending_contact_inquiries' => [
                            'path' => '/api/admin/contact-inquiries',
                            'query' => [
                                'status' => ContactInquiry::STATUS_PENDING,
                                'sort' => 'created_at',
                                'direction' => 'desc',
                            ],
                        ],
                        'requested_refunds' => [
                            'path' => '/api/admin/refund-requests',
                            'query' => [
                                'status' => Refund::STATUS_REQUESTED,
                                'sort' => 'created_at',
                                'direction' => 'desc',
                            ],
                        ],
                        'requested_payouts' => [
                            'path' => '/api/admin/payout-requests',
                            'query' => [
                                'status' => PayoutRequest::STATUS_REQUESTED,
                                'sort' => 'scheduled_process_date',
                                'direction' => 'asc',
                            ],
                        ],
                    ],
                    'bookings' => [
                        'requested' => [
                            'path' => '/api/admin/bookings',
                            'query' => [
                                'status' => Booking::STATUS_REQUESTED,
                                'sort' => 'created_at',
                                'direction' => 'desc',
                            ],
                        ],
                        'in_progress' => [
                            'path' => '/api/admin/bookings',
                            'query' => [
                                'status' => Booking::STATUS_IN_PROGRESS,
                                'sort' => 'updated_at',
                                'direction' => 'desc',
                            ],
                        ],
                        'completed_today' => [
                            'path' => '/api/admin/bookings',
                            'query' => [
                                'status' => Booking::STATUS_COMPLETED,
                                'completed_on' => today()->toDateString(),
                                'sort' => 'updated_at',
                                'direction' => 'desc',
                            ],
                        ],
                    ],
                ],
            ],
        ]);
    }
}
