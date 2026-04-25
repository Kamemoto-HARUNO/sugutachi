<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Booking;
use App\Models\BookingMessage;
use App\Models\ContactInquiry;
use App\Models\IdentityVerification;
use App\Models\PayoutRequest;
use App\Models\ProfilePhoto;
use App\Models\Refund;
use App\Models\Report;
use App\Models\ServiceAddress;
use App\Models\StripeConnectedAccount;
use App\Models\StripeDispute;
use App\Models\TherapistMenu;
use App\Models\TherapistPricingRule;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Tests\TestCase;

class AdminDashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_view_dashboard_summary(): void
    {
        $admin = Account::factory()->create(['public_id' => 'acc_admin_dashboard']);
        $admin->roleAssignments()->create([
            'role' => 'admin',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        $suspendedUser = Account::factory()->create([
            'public_id' => 'acc_dashboard_suspended',
            'status' => Account::STATUS_SUSPENDED,
            'suspended_at' => now(),
        ]);
        $therapist = Account::factory()->create(['public_id' => 'acc_dashboard_therapist']);

        $therapistProfile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_dashboard',
            'public_name' => 'Dashboard Therapist',
            'profile_status' => TherapistProfile::STATUS_PENDING,
            'photo_review_status' => ProfilePhoto::STATUS_PENDING,
        ]);
        TherapistProfile::create([
            'account_id' => Account::factory()->create(['public_id' => 'acc_dashboard_therapist_suspended'])->id,
            'public_id' => 'thp_dashboard_suspended',
            'public_name' => 'Suspended Dashboard Therapist',
            'profile_status' => TherapistProfile::STATUS_SUSPENDED,
            'photo_review_status' => ProfilePhoto::STATUS_APPROVED,
            'rejected_reason_code' => 'policy_violation',
        ]);
        $connectedAccount = StripeConnectedAccount::create([
            'account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'stripe_account_id' => 'acct_dashboard',
            'account_type' => 'express',
            'status' => 'pending',
        ]);
        $therapistMenu = TherapistMenu::create([
            'public_id' => 'menu_dashboard_60',
            'therapist_profile_id' => $therapistProfile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
        ]);
        TherapistPricingRule::create([
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => null,
            'rule_type' => TherapistPricingRule::RULE_TYPE_USER_PROFILE_ATTRIBUTE,
            'condition_json' => [
                'field' => TherapistPricingRule::FIELD_BODY_TYPE,
                'operator' => TherapistPricingRule::OPERATOR_EQUALS,
                'value' => 'muscular',
            ],
            'adjustment_type' => TherapistPricingRule::ADJUSTMENT_TYPE_FIXED_AMOUNT,
            'adjustment_amount' => 1000,
            'priority' => 10,
            'is_active' => true,
        ]);
        TherapistPricingRule::create([
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $therapistMenu->id,
            'rule_type' => TherapistPricingRule::RULE_TYPE_DEMAND_LEVEL,
            'condition_json' => [
                'operator' => TherapistPricingRule::OPERATOR_EQUALS,
                'value' => TherapistPricingRule::DEMAND_LEVEL_BUSY,
            ],
            'adjustment_type' => TherapistPricingRule::ADJUSTMENT_TYPE_FIXED_AMOUNT,
            'adjustment_amount' => 1500,
            'priority' => 20,
            'is_active' => true,
        ]);
        TherapistPricingRule::create([
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => null,
            'rule_type' => TherapistPricingRule::RULE_TYPE_TIME_BAND,
            'condition_json' => [
                'start_hour' => 21,
                'end_hour' => 24,
            ],
            'adjustment_type' => TherapistPricingRule::ADJUSTMENT_TYPE_PERCENTAGE,
            'adjustment_amount' => 10,
            'priority' => 30,
            'is_active' => false,
        ]);
        $serviceAddress = ServiceAddress::create([
            'public_id' => 'addr_dashboard',
            'account_id' => $suspendedUser->id,
            'place_type' => 'hotel',
            'address_line_encrypted' => Crypt::encryptString('dashboard address'),
            'lat' => '35.6812360',
            'lng' => '139.7671250',
        ]);

        IdentityVerification::create([
            'account_id' => $suspendedUser->id,
            'status' => IdentityVerification::STATUS_PENDING,
            'self_declared_male' => true,
        ]);
        ProfilePhoto::create([
            'account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'usage_type' => 'therapist_profile',
            'storage_key_encrypted' => Crypt::encryptString('photos/dashboard.jpg'),
            'status' => ProfilePhoto::STATUS_PENDING,
        ]);
        $requestedBooking = Booking::create([
            'public_id' => 'book_dashboard_requested',
            'user_account_id' => $suspendedUser->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $therapistMenu->id,
            'service_address_id' => $serviceAddress->id,
            'status' => Booking::STATUS_REQUESTED,
            'duration_minutes' => 60,
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);
        $interruptedBooking = Booking::create([
            'public_id' => 'book_dashboard_interrupted',
            'user_account_id' => $suspendedUser->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $therapistMenu->id,
            'service_address_id' => $serviceAddress->id,
            'status' => Booking::STATUS_INTERRUPTED,
            'duration_minutes' => 60,
            'interrupted_at' => now(),
            'interruption_reason_code' => 'safety_concern',
            'cancel_reason_code' => 'safety_concern',
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);
        $inProgressBooking = Booking::create([
            'public_id' => 'book_dashboard_progress',
            'user_account_id' => $suspendedUser->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $therapistMenu->id,
            'service_address_id' => $serviceAddress->id,
            'status' => Booking::STATUS_IN_PROGRESS,
            'duration_minutes' => 60,
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);
        $completedBooking = Booking::create([
            'public_id' => 'book_dashboard_completed',
            'user_account_id' => $suspendedUser->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $therapistMenu->id,
            'service_address_id' => $serviceAddress->id,
            'status' => Booking::STATUS_COMPLETED,
            'duration_minutes' => 60,
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
            'updated_at' => now(),
        ]);
        $flaggedMessage = BookingMessage::create([
            'booking_id' => $requestedBooking->id,
            'sender_account_id' => $therapist->id,
            'message_type' => 'text',
            'body_encrypted' => Crypt::encryptString('Call me directly at 090-1111-1111'),
            'detected_contact_exchange' => true,
            'moderation_status' => 'blocked',
            'sent_at' => now()->subMinutes(5),
        ]);
        Report::create([
            'public_id' => 'rep_dashboard',
            'booking_id' => $requestedBooking->id,
            'source_booking_message_id' => $flaggedMessage->id,
            'reporter_account_id' => $suspendedUser->id,
            'target_account_id' => $therapist->id,
            'category' => 'boundary_violation',
            'severity' => Report::SEVERITY_HIGH,
            'status' => Report::STATUS_OPEN,
        ]);
        Report::create([
            'public_id' => 'rep_dashboard_interrupted',
            'booking_id' => $interruptedBooking->id,
            'reporter_account_id' => $therapist->id,
            'target_account_id' => $suspendedUser->id,
            'category' => 'booking_interrupted',
            'severity' => Report::SEVERITY_HIGH,
            'status' => Report::STATUS_OPEN,
        ]);
        Refund::create([
            'public_id' => 'ref_dashboard',
            'booking_id' => $completedBooking->id,
            'requested_by_account_id' => $suspendedUser->id,
            'status' => Refund::STATUS_REQUESTED,
            'reason_code' => 'service_issue',
            'requested_amount' => 5000,
        ]);
        PayoutRequest::create([
            'public_id' => 'pay_dashboard',
            'therapist_account_id' => $therapist->id,
            'stripe_connected_account_id' => $connectedAccount->id,
            'status' => PayoutRequest::STATUS_REQUESTED,
            'requested_amount' => 10800,
            'net_amount' => 10800,
            'requested_at' => now(),
            'scheduled_process_date' => today(),
        ]);
        ContactInquiry::create([
            'public_id' => 'ctc_dashboard',
            'account_id' => $suspendedUser->id,
            'name' => 'Dashboard User',
            'email' => 'dashboard@example.com',
            'category' => 'booking',
            'message' => 'Need help with a booking.',
            'status' => ContactInquiry::STATUS_PENDING,
            'source' => ContactInquiry::SOURCE_AUTHENTICATED,
        ]);
        StripeDispute::create([
            'booking_id' => $completedBooking->id,
            'payment_intent_id' => null,
            'stripe_dispute_id' => 'dp_dashboard',
            'status' => StripeDispute::STATUS_NEEDS_RESPONSE,
            'reason' => 'fraudulent',
            'amount' => 12300,
            'currency' => 'jpy',
            'evidence_due_by' => now()->addDays(7),
            'last_stripe_event_id' => 'evt_dashboard_dispute',
        ]);
        $this->withToken($admin->createToken('api')->plainTextToken)
            ->getJson('/api/admin/dashboard')
            ->assertOk()
            ->assertJsonPath('data.accounts.total', 4)
            ->assertJsonPath('data.accounts.suspended', 1)
            ->assertJsonPath('data.reviews.pending_identity_verifications', 1)
            ->assertJsonPath('data.reviews.pending_therapist_profiles', 1)
            ->assertJsonPath('data.reviews.suspended_therapist_profiles', 1)
            ->assertJsonPath('data.reviews.pending_profile_photos', 1)
            ->assertJsonPath('data.operations.open_reports', 2)
            ->assertJsonPath('data.operations.open_interruption_reports', 1)
            ->assertJsonPath('data.operations.open_message_origin_reports', 1)
            ->assertJsonPath('data.operations.pending_contact_inquiries', 1)
            ->assertJsonPath('data.operations.open_stripe_disputes', 1)
            ->assertJsonPath('data.operations.requested_refunds', 1)
            ->assertJsonPath('data.operations.requested_payouts', 1)
            ->assertJsonPath('data.bookings.requested', 1)
            ->assertJsonPath('data.bookings.interrupted', 1)
            ->assertJsonPath('data.bookings.in_progress', 1)
            ->assertJsonPath('data.bookings.completed_today', 1)
            ->assertJsonPath('data.bookings.needs_message_review', 1)
            ->assertJsonPath('data.pricing_rules.total', 3)
            ->assertJsonPath('data.pricing_rules.active', 2)
            ->assertJsonPath('data.pricing_rules.inactive', 1)
            ->assertJsonPath('data.pricing_rules.active_profile_adjustments', 1)
            ->assertJsonPath('data.pricing_rules.active_demand_fees', 1)
            ->assertJsonPath('data.navigation.accounts.suspended.path', '/api/admin/accounts')
            ->assertJsonPath('data.navigation.accounts.suspended.query.status', Account::STATUS_SUSPENDED)
            ->assertJsonPath('data.navigation.reviews.pending_identity_verifications.path', '/api/admin/identity-verifications')
            ->assertJsonPath('data.navigation.reviews.pending_identity_verifications.query.sort', 'submitted_at')
            ->assertJsonPath('data.navigation.reviews.suspended_therapist_profiles.path', '/api/admin/therapist-profiles')
            ->assertJsonPath('data.navigation.reviews.suspended_therapist_profiles.query.status', TherapistProfile::STATUS_SUSPENDED)
            ->assertJsonPath('data.navigation.operations.open_interruption_reports.path', '/api/admin/reports')
            ->assertJsonPath('data.navigation.operations.open_interruption_reports.query.category', 'booking_interrupted')
            ->assertJsonPath('data.navigation.operations.open_message_origin_reports.path', '/api/admin/reports')
            ->assertJsonPath('data.navigation.operations.open_message_origin_reports.query.has_source_booking_message', true)
            ->assertJsonPath('data.navigation.operations.pending_contact_inquiries.path', '/api/admin/contact-inquiries')
            ->assertJsonPath('data.navigation.operations.pending_contact_inquiries.query.status', ContactInquiry::STATUS_PENDING)
            ->assertJsonPath('data.navigation.operations.open_stripe_disputes.path', '/api/admin/stripe-disputes')
            ->assertJsonPath('data.navigation.operations.open_stripe_disputes.query.status_group', 'open')
            ->assertJsonPath('data.navigation.operations.requested_payouts.path', '/api/admin/payout-requests')
            ->assertJsonPath('data.navigation.operations.requested_payouts.query.direction', 'asc')
            ->assertJsonPath('data.navigation.bookings.requested.path', '/api/admin/bookings')
            ->assertJsonPath('data.navigation.bookings.interrupted.query.status', Booking::STATUS_INTERRUPTED)
            ->assertJsonPath('data.navigation.bookings.completed_today.query.completed_on', today()->toDateString())
            ->assertJsonPath('data.navigation.bookings.needs_message_review.query.has_flagged_message', true)
            ->assertJsonPath('data.navigation.pricing_rules.active.path', '/api/admin/pricing-rules')
            ->assertJsonPath('data.navigation.pricing_rules.active.query.is_active', true)
            ->assertJsonPath('data.navigation.pricing_rules.inactive.query.is_active', false)
            ->assertJsonPath('data.navigation.pricing_rules.active_profile_adjustments.query.adjustment_bucket', 'profile_adjustment')
            ->assertJsonPath('data.navigation.pricing_rules.active_demand_fees.query.adjustment_bucket', 'demand_fee');
    }

    public function test_non_admin_cannot_view_dashboard_summary(): void
    {
        $user = Account::factory()->create();

        $this->withToken($user->createToken('api')->plainTextToken)
            ->getJson('/api/admin/dashboard')
            ->assertForbidden();
    }
}
