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
use App\Models\StripeDispute;
use App\Models\TherapistPricingRule;
use App\Models\TherapistProfile;
use App\Models\TherapistTravelRequest;
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
                    'suspended_therapist_profiles' => TherapistProfile::query()
                        ->where('profile_status', TherapistProfile::STATUS_SUSPENDED)
                        ->count(),
                    'pending_profile_photos' => ProfilePhoto::query()
                        ->where('status', ProfilePhoto::STATUS_PENDING)
                        ->count(),
                ],
                'operations' => [
                    'open_reports' => Report::query()
                        ->where('status', Report::STATUS_OPEN)
                        ->count(),
                    'open_interruption_reports' => Report::query()
                        ->where('status', Report::STATUS_OPEN)
                        ->where('category', 'booking_interrupted')
                        ->count(),
                    'open_message_origin_reports' => Report::query()
                        ->where('status', Report::STATUS_OPEN)
                        ->whereNotNull('source_booking_message_id')
                        ->count(),
                    'pending_contact_inquiries' => ContactInquiry::query()
                        ->where('status', ContactInquiry::STATUS_PENDING)
                        ->count(),
                    'unread_travel_requests' => TherapistTravelRequest::query()
                        ->where('status', TherapistTravelRequest::STATUS_UNREAD)
                        ->count(),
                    'pending_travel_request_reviews' => TherapistTravelRequest::query()
                        ->where('monitoring_status', TherapistTravelRequest::MONITORING_STATUS_UNREVIEWED)
                        ->count(),
                    'open_stripe_disputes' => StripeDispute::query()
                        ->whereIn('status', [
                            StripeDispute::STATUS_NEEDS_RESPONSE,
                            StripeDispute::STATUS_UNDER_REVIEW,
                        ])
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
                    'interrupted' => Booking::query()->where('status', Booking::STATUS_INTERRUPTED)->count(),
                    'in_progress' => Booking::query()->where('status', Booking::STATUS_IN_PROGRESS)->count(),
                    'completed_today' => Booking::query()
                        ->where('status', Booking::STATUS_COMPLETED)
                        ->whereDate('updated_at', today())
                        ->count(),
                    'needs_message_review' => Booking::query()
                        ->whereHas('messages', fn ($query) => $query->flagged())
                        ->count(),
                ],
                'pricing_rules' => [
                    'total' => TherapistPricingRule::query()->count(),
                    'active' => TherapistPricingRule::query()->where('is_active', true)->count(),
                    'inactive' => TherapistPricingRule::query()->where('is_active', false)->count(),
                    'active_profile_adjustments' => TherapistPricingRule::query()
                        ->where('is_active', true)
                        ->where('rule_type', TherapistPricingRule::RULE_TYPE_USER_PROFILE_ATTRIBUTE)
                        ->count(),
                    'active_demand_fees' => TherapistPricingRule::query()
                        ->where('is_active', true)
                        ->whereIn('rule_type', [
                            TherapistPricingRule::RULE_TYPE_TIME_BAND,
                            TherapistPricingRule::RULE_TYPE_WALKING_TIME_RANGE,
                            TherapistPricingRule::RULE_TYPE_DEMAND_LEVEL,
                        ])
                        ->count(),
                    'needs_attention' => TherapistPricingRule::query()->needsMonitoring()->count(),
                    'pending_review' => TherapistPricingRule::query()
                        ->needsMonitoring()
                        ->where('monitoring_status', TherapistPricingRule::MONITORING_STATUS_UNREVIEWED)
                        ->count(),
                    'inactive_menu_rules' => TherapistPricingRule::query()
                        ->withMonitoringFlag(TherapistPricingRule::MONITORING_FLAG_INACTIVE_MENU)
                        ->count(),
                    'extreme_percentage_adjustments' => TherapistPricingRule::query()
                        ->withMonitoringFlag(TherapistPricingRule::MONITORING_FLAG_EXTREME_PERCENTAGE)
                        ->count(),
                    'menu_price_override_rules' => TherapistPricingRule::query()
                        ->withMonitoringFlag(TherapistPricingRule::MONITORING_FLAG_MENU_PRICE_OVERRIDE)
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
                        'suspended_therapist_profiles' => [
                            'path' => '/api/admin/therapist-profiles',
                            'query' => [
                                'status' => TherapistProfile::STATUS_SUSPENDED,
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
                        'open_interruption_reports' => [
                            'path' => '/api/admin/reports',
                            'query' => [
                                'status' => Report::STATUS_OPEN,
                                'category' => 'booking_interrupted',
                                'sort' => 'created_at',
                                'direction' => 'desc',
                            ],
                        ],
                        'open_message_origin_reports' => [
                            'path' => '/api/admin/reports',
                            'query' => [
                                'status' => Report::STATUS_OPEN,
                                'has_source_booking_message' => true,
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
                        'unread_travel_requests' => [
                            'path' => '/api/admin/travel-requests',
                            'query' => [
                                'status' => TherapistTravelRequest::STATUS_UNREAD,
                                'sort' => 'created_at',
                                'direction' => 'desc',
                            ],
                        ],
                        'pending_travel_request_reviews' => [
                            'path' => '/api/admin/travel-requests',
                            'query' => [
                                'monitoring_status' => TherapistTravelRequest::MONITORING_STATUS_UNREVIEWED,
                                'sort' => 'created_at',
                                'direction' => 'desc',
                            ],
                        ],
                        'open_stripe_disputes' => [
                            'path' => '/api/admin/stripe-disputes',
                            'query' => [
                                'status_group' => 'open',
                                'sort' => 'evidence_due_by',
                                'direction' => 'asc',
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
                        'interrupted' => [
                            'path' => '/api/admin/bookings',
                            'query' => [
                                'status' => Booking::STATUS_INTERRUPTED,
                                'sort' => 'updated_at',
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
                        'needs_message_review' => [
                            'path' => '/api/admin/bookings',
                            'query' => [
                                'has_flagged_message' => true,
                                'sort' => 'updated_at',
                                'direction' => 'desc',
                            ],
                        ],
                    ],
                    'pricing_rules' => [
                        'active' => [
                            'path' => '/api/admin/pricing-rules',
                            'query' => [
                                'is_active' => true,
                                'sort' => 'priority',
                                'direction' => 'asc',
                            ],
                        ],
                        'inactive' => [
                            'path' => '/api/admin/pricing-rules',
                            'query' => [
                                'is_active' => false,
                                'sort' => 'updated_at',
                                'direction' => 'desc',
                            ],
                        ],
                        'active_profile_adjustments' => [
                            'path' => '/api/admin/pricing-rules',
                            'query' => [
                                'is_active' => true,
                                'adjustment_bucket' => 'profile_adjustment',
                                'sort' => 'priority',
                                'direction' => 'asc',
                            ],
                        ],
                        'active_demand_fees' => [
                            'path' => '/api/admin/pricing-rules',
                            'query' => [
                                'is_active' => true,
                                'adjustment_bucket' => 'demand_fee',
                                'sort' => 'priority',
                                'direction' => 'asc',
                            ],
                        ],
                        'needs_attention' => [
                            'path' => '/api/admin/pricing-rules',
                            'query' => [
                                'has_monitoring_flags' => true,
                                'sort' => 'updated_at',
                                'direction' => 'desc',
                            ],
                        ],
                        'pending_review' => [
                            'path' => '/api/admin/pricing-rules',
                            'query' => [
                                'has_monitoring_flags' => true,
                                'monitoring_status' => TherapistPricingRule::MONITORING_STATUS_UNREVIEWED,
                                'sort' => 'updated_at',
                                'direction' => 'desc',
                            ],
                        ],
                        'inactive_menu_rules' => [
                            'path' => '/api/admin/pricing-rules',
                            'query' => [
                                'monitoring_flag' => TherapistPricingRule::MONITORING_FLAG_INACTIVE_MENU,
                                'sort' => 'updated_at',
                                'direction' => 'desc',
                            ],
                        ],
                        'extreme_percentage_adjustments' => [
                            'path' => '/api/admin/pricing-rules',
                            'query' => [
                                'monitoring_flag' => TherapistPricingRule::MONITORING_FLAG_EXTREME_PERCENTAGE,
                                'sort' => 'priority',
                                'direction' => 'asc',
                            ],
                        ],
                        'menu_price_override_rules' => [
                            'path' => '/api/admin/pricing-rules',
                            'query' => [
                                'monitoring_flag' => TherapistPricingRule::MONITORING_FLAG_MENU_PRICE_OVERRIDE,
                                'sort' => 'priority',
                                'direction' => 'asc',
                            ],
                        ],
                    ],
                ],
            ],
        ]);
    }
}
