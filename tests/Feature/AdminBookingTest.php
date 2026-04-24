<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Booking;
use App\Models\BookingConsent;
use App\Models\BookingHealthCheck;
use App\Models\BookingMessage;
use App\Models\BookingQuote;
use App\Models\LegalDocument;
use App\Models\PaymentIntent;
use App\Models\Refund;
use App\Models\Report;
use App\Models\ServiceAddress;
use App\Models\StripeDispute;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;
use Tests\TestCase;

class AdminBookingTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_and_view_bookings(): void
    {
        [$admin, $user, $therapist, $therapistProfile, $booking] = $this->createBookingFixture();
        $token = $admin->createToken('api')->plainTextToken;

        Booking::create([
            'public_id' => 'book_admin_other',
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $booking->therapist_menu_id,
            'service_address_id' => $booking->service_address_id,
            'status' => Booking::STATUS_CANCELED,
            'duration_minutes' => 90,
            'total_amount' => 18000,
            'therapist_net_amount' => 15000,
            'platform_fee_amount' => 2400,
            'matching_fee_amount' => 600,
        ]);

        $this->withToken($token)
            ->getJson("/api/admin/bookings?status=requested&user_account_id={$user->public_id}&therapist_profile_id={$therapistProfile->public_id}&sort=created_at&direction=asc")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $booking->public_id)
            ->assertJsonPath('data.0.user_account.public_id', $user->public_id)
            ->assertJsonPath('data.0.therapist_profile.public_id', $therapistProfile->public_id)
            ->assertJsonPath('data.0.current_payment_intent_status', 'requires_capture')
            ->assertJsonPath('data.0.refund_count', 1)
            ->assertJsonPath('data.0.report_count', 1)
            ->assertJsonPath('data.0.open_dispute_count', 1)
            ->assertJsonPath('data.0.flagged_message_count', 1);

        $this->withToken($token)
            ->getJson("/api/admin/bookings/{$booking->public_id}")
            ->assertOk()
            ->assertJsonPath('data.public_id', $booking->public_id)
            ->assertJsonPath('data.service_address.address_line', 'Tokyo Station Hotel 1201')
            ->assertJsonPath('data.current_payment_intent.status', 'requires_capture')
            ->assertJsonPath('data.current_quote.quote_id', 'quote_admin_booking')
            ->assertJsonPath('data.refunds.0.public_id', 'ref_admin_booking')
            ->assertJsonPath('data.reports.0.public_id', 'rep_admin_booking')
            ->assertJsonPath('data.status_logs.0.to_status', Booking::STATUS_REQUESTED);

        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'booking.view',
            'target_type' => Booking::class,
            'target_id' => $booking->id,
        ]);
    }

    public function test_admin_can_filter_completed_bookings_by_completed_on(): void
    {
        [$admin, , , , $booking] = $this->createBookingFixture();
        $booking->forceFill([
            'status' => Booking::STATUS_COMPLETED,
            'updated_at' => now()->subDay(),
        ])->save();

        $todayCompleted = Booking::query()->create([
            'public_id' => 'book_admin_completed_today',
            'user_account_id' => $booking->user_account_id,
            'therapist_account_id' => $booking->therapist_account_id,
            'therapist_profile_id' => $booking->therapist_profile_id,
            'therapist_menu_id' => $booking->therapist_menu_id,
            'service_address_id' => $booking->service_address_id,
            'status' => Booking::STATUS_COMPLETED,
            'duration_minutes' => 60,
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
            'updated_at' => now(),
        ]);

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->getJson('/api/admin/bookings?status=completed&completed_on='.today()->toDateString())
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $todayCompleted->public_id);
    }

    public function test_admin_can_filter_bookings_by_operational_flags(): void
    {
        [$admin, $user, $therapist, $therapistProfile, $booking] = $this->createBookingFixture();

        Booking::create([
            'public_id' => 'book_admin_booking_plain',
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $booking->therapist_menu_id,
            'service_address_id' => $booking->service_address_id,
            'status' => Booking::STATUS_REQUESTED,
            'is_on_demand' => false,
            'duration_minutes' => 60,
            'request_expires_at' => now()->addDays(5),
            'total_amount' => 10000,
            'therapist_net_amount' => 8500,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->getJson('/api/admin/bookings?is_on_demand=1&payment_intent_status=requires_capture&has_refund_request=1&has_open_report=1&has_open_dispute=1&has_flagged_message=1&request_expires_to='.today()->toDateString())
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $booking->public_id);
    }

    public function test_admin_can_filter_canceled_bookings_with_auto_refund_context(): void
    {
        [$admin, $user, $therapist, , $booking] = $this->createBookingFixture();

        $booking->forceFill([
            'status' => Booking::STATUS_CANCELED,
            'canceled_at' => now(),
            'canceled_by_account_id' => $therapist->id,
            'cancel_reason_code' => 'therapist_unavailable',
            'cancel_reason_note_encrypted' => Crypt::encryptString('急な体調不良のため、本日のご案内ができなくなりました。'),
        ])->save();

        $paymentIntentId = PaymentIntent::query()
            ->where('booking_id', $booking->id)
            ->value('id');

        Refund::create([
            'public_id' => 'ref_admin_booking_auto',
            'booking_id' => $booking->id,
            'payment_intent_id' => $paymentIntentId,
            'requested_by_account_id' => $therapist->id,
            'status' => Refund::STATUS_PROCESSED,
            'reason_code' => Refund::REASON_CODE_BOOKING_CANCELLATION_AUTO,
            'requested_amount' => 6000,
            'approved_amount' => 6000,
            'stripe_refund_id' => 're_admin_booking_auto',
            'processed_at' => now(),
        ]);

        $token = $admin->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/admin/bookings?status=canceled&cancel_reason_code=therapist_unavailable&has_auto_refund=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $booking->public_id)
            ->assertJsonPath('data.0.cancel_reason_code', 'therapist_unavailable')
            ->assertJsonPath('data.0.cancel_reason_note', '急な体調不良のため、本日のご案内ができなくなりました。')
            ->assertJsonPath('data.0.canceled_by_account.public_id', $therapist->public_id)
            ->assertJsonPath('data.0.auto_refund_count', 1);

        $this->withToken($token)
            ->getJson("/api/admin/bookings/{$booking->public_id}")
            ->assertOk()
            ->assertJsonPath('data.public_id', $booking->public_id)
            ->assertJsonPath('data.cancel_reason_note', '急な体調不良のため、本日のご案内ができなくなりました。')
            ->assertJsonPath('data.canceled_by_account.public_id', $therapist->public_id)
            ->assertJsonPath('data.auto_refund_count', 1)
            ->assertJsonFragment([
                'public_id' => 'ref_admin_booking_auto',
                'reason_code' => Refund::REASON_CODE_BOOKING_CANCELLATION_AUTO,
                'requested_by_account_id' => $therapist->public_id,
                'approved_amount' => 6000,
            ]);

        $this->withToken($token)
            ->getJson('/api/admin/bookings?has_auto_refund=0&status=requested')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->withToken($token)
            ->getJson('/api/admin/bookings?has_auto_refund=0&status=canceled')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->withToken($token)
            ->getJson('/api/admin/bookings?has_auto_refund=1&status=requested')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'booking.view',
            'target_type' => Booking::class,
            'target_id' => $booking->id,
        ]);

        $this->assertSame($user->id, $booking->user_account_id);
    }

    public function test_admin_can_filter_and_view_interrupted_booking_safety_context(): void
    {
        [$admin, $user, $therapist, , $booking] = $this->createBookingFixture();

        $booking->forceFill([
            'status' => Booking::STATUS_INTERRUPTED,
            'interrupted_at' => now(),
            'interruption_reason_code' => 'safety_concern',
            'cancel_reason_code' => 'safety_concern',
            'cancel_reason_note_encrypted' => Crypt::encryptString('体調面の懸念により施術を中断しました。'),
            'canceled_by_account_id' => $therapist->id,
        ])->save();

        $legalDocument = LegalDocument::create([
            'public_id' => 'ldc_admin_booking_safety',
            'document_type' => 'terms',
            'version' => '2026-04-24',
            'title' => '安全確認',
            'body' => 'test',
            'published_at' => now(),
            'effective_at' => now(),
        ]);

        BookingConsent::create([
            'booking_id' => $booking->id,
            'account_id' => $user->id,
            'consent_type' => 'relaxation_purpose_acknowledged',
            'legal_document_id' => $legalDocument->id,
            'consented_at' => now()->subMinutes(15),
            'ip_hash' => hash('sha256', '127.0.0.1'),
        ]);

        BookingHealthCheck::create([
            'booking_id' => $booking->id,
            'account_id' => $user->id,
            'role' => 'user',
            'drinking_status' => 'none',
            'has_injury' => false,
            'has_fever' => false,
            'contraindications_json' => ['首まわりは避けたい'],
            'notes_encrypted' => Crypt::encryptString('今日は軽めの力加減を希望。'),
            'checked_at' => now()->subMinutes(10),
        ]);

        Report::create([
            'public_id' => 'rep_admin_booking_interrupted',
            'booking_id' => $booking->id,
            'reporter_account_id' => $therapist->id,
            'target_account_id' => $user->id,
            'category' => 'booking_interrupted',
            'severity' => Report::SEVERITY_HIGH,
            'status' => Report::STATUS_OPEN,
        ]);

        $token = $admin->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/admin/bookings?status=interrupted&interruption_reason_code=safety_concern&has_consent=1&has_health_check=1&has_interruption_report=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $booking->public_id)
            ->assertJsonPath('data.0.interruption_reason_code', 'safety_concern')
            ->assertJsonPath('data.0.consent_count', 1)
            ->assertJsonPath('data.0.health_check_count', 1)
            ->assertJsonPath('data.0.interruption_report_count', 1);

        $this->withToken($token)
            ->getJson("/api/admin/bookings/{$booking->public_id}")
            ->assertOk()
            ->assertJsonPath('data.public_id', $booking->public_id)
            ->assertJsonPath('data.interruption_reason_code', 'safety_concern')
            ->assertJsonPath('data.interruption_report_count', 1)
            ->assertJsonPath('data.consents.0.account.public_id', $user->public_id)
            ->assertJsonPath('data.consents.0.consent_type', 'relaxation_purpose_acknowledged')
            ->assertJsonPath('data.consents.0.legal_document.public_id', $legalDocument->public_id)
            ->assertJsonPath('data.health_checks.0.account.public_id', $user->public_id)
            ->assertJsonPath('data.health_checks.0.notes', '今日は軽めの力加減を希望。');
    }

    public function test_non_admin_cannot_access_booking_admin_api(): void
    {
        [, $user, , , $booking] = $this->createBookingFixture();

        $this->withToken($user->createToken('api')->plainTextToken)
            ->getJson("/api/admin/bookings/{$booking->public_id}")
            ->assertForbidden();
    }

    public function test_admin_can_view_booking_messages_with_filters(): void
    {
        [$admin, $user, $therapist, , $booking] = $this->createBookingFixture();

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->getJson("/api/admin/bookings/{$booking->public_id}/messages?sender_account_id={$user->public_id}&read_status=unread")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.sender.public_id', $user->public_id)
            ->assertJsonPath('data.0.sender.status', Account::STATUS_ACTIVE)
            ->assertJsonPath('data.0.body', 'I am in the hotel lobby.')
            ->assertJsonPath('data.0.detected_contact_exchange', false);

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->getJson("/api/admin/bookings/{$booking->public_id}/messages?sender_account_id={$therapist->public_id}&detected_contact_exchange=1")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.sender.public_id', $therapist->public_id)
            ->assertJsonPath('data.0.sender.status', Account::STATUS_ACTIVE)
            ->assertJsonPath('data.0.detected_contact_exchange', true)
            ->assertJsonPath('data.0.open_report_count', 0);

        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'booking.messages.view',
            'target_type' => Booking::class,
            'target_id' => $booking->id,
        ]);
    }

    public function test_admin_can_note_and_moderate_booking_message(): void
    {
        [$admin, , , , $booking] = $this->createBookingFixture();
        $message = BookingMessage::query()
            ->where('booking_id', $booking->id)
            ->where('moderation_status', BookingMessage::MODERATION_STATUS_BLOCKED)
            ->firstOrFail();

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->postJson("/api/admin/bookings/{$booking->public_id}/messages/{$message->id}/notes", [
                'note' => 'Possible off-platform contact exchange. Keep under review.',
            ])
            ->assertOk()
            ->assertJsonPath('data.id', $message->id)
            ->assertJsonPath('data.admin_note_count', 1)
            ->assertJsonPath('data.notes.0.note', 'Possible off-platform contact exchange. Keep under review.')
            ->assertJsonPath('data.moderation_status', BookingMessage::MODERATION_STATUS_BLOCKED);

        $this->assertDatabaseHas('admin_notes', [
            'target_type' => BookingMessage::class,
            'target_id' => $message->id,
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'booking.message.note',
            'target_type' => BookingMessage::class,
            'target_id' => $message->id,
        ]);

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->postJson("/api/admin/bookings/{$booking->public_id}/messages/{$message->id}/moderation", [
                'moderation_status' => BookingMessage::MODERATION_STATUS_REVIEWED,
                'note' => 'Reviewed by operations and closed.',
            ])
            ->assertOk()
            ->assertJsonPath('data.id', $message->id)
            ->assertJsonPath('data.moderation_status', BookingMessage::MODERATION_STATUS_REVIEWED)
            ->assertJsonPath('data.moderated_by_admin.public_id', $admin->public_id)
            ->assertJsonPath('data.admin_note_count', 2)
            ->assertJsonPath('data.notes.1.note', 'Reviewed by operations and closed.');

        $this->assertDatabaseHas('booking_messages', [
            'id' => $message->id,
            'moderation_status' => BookingMessage::MODERATION_STATUS_REVIEWED,
            'moderated_by_admin_account_id' => $admin->id,
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'booking.message.moderate',
            'target_type' => BookingMessage::class,
            'target_id' => $message->id,
        ]);

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->getJson("/api/admin/bookings/{$booking->public_id}/messages?has_admin_notes=1&moderated_by_admin_account_id={$admin->public_id}&moderation_status=".BookingMessage::MODERATION_STATUS_REVIEWED)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $message->id)
            ->assertJsonPath('data.0.admin_note_count', 2)
            ->assertJsonPath('data.0.moderated_by_admin.public_id', $admin->public_id);

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->getJson('/api/admin/bookings?has_flagged_message=1')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_admin_can_create_report_from_booking_message(): void
    {
        [$admin, , $therapist, , $booking] = $this->createBookingFixture();
        $message = BookingMessage::query()
            ->where('booking_id', $booking->id)
            ->where('sender_account_id', $therapist->id)
            ->firstOrFail();

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->postJson("/api/admin/bookings/{$booking->public_id}/messages/{$message->id}/reports", [
                'category' => 'prohibited_contact_exchange',
                'severity' => Report::SEVERITY_HIGH,
                'detail' => 'Escalated after therapist shared direct contact information.',
                'note' => 'Created report from flagged booking message.',
            ])
            ->assertCreated()
            ->assertJsonPath('data.booking_public_id', $booking->public_id)
            ->assertJsonPath('data.source_booking_message.id', $message->id)
            ->assertJsonPath('data.source_booking_message.sender_account_public_id', $therapist->public_id)
            ->assertJsonPath('data.target_account.public_id', $therapist->public_id)
            ->assertJsonPath('data.assigned_admin.public_id', $admin->public_id)
            ->assertJsonPath('data.category', 'prohibited_contact_exchange')
            ->assertJsonPath('data.actions.0.action_type', 'report_created_from_message');

        $this->assertDatabaseHas('reports', [
            'booking_id' => $booking->id,
            'source_booking_message_id' => $message->id,
            'reporter_account_id' => $admin->id,
            'target_account_id' => $therapist->id,
            'category' => 'prohibited_contact_exchange',
            'status' => Report::STATUS_OPEN,
            'assigned_admin_account_id' => $admin->id,
        ]);
        $this->assertDatabaseHas('booking_messages', [
            'id' => $message->id,
            'moderation_status' => BookingMessage::MODERATION_STATUS_ESCALATED,
            'moderated_by_admin_account_id' => $admin->id,
        ]);
        $this->assertDatabaseHas('admin_notes', [
            'target_type' => BookingMessage::class,
            'target_id' => $message->id,
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'booking.message.report_create',
            'target_type' => Report::class,
        ]);

        $report = Report::query()->where('source_booking_message_id', $message->id)->firstOrFail();

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->getJson("/api/admin/reports?source_booking_message_id={$message->id}")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $report->public_id)
            ->assertJsonPath('data.0.source_booking_message.id', $message->id);

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->getJson("/api/admin/bookings/{$booking->public_id}/messages?has_open_report=1")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $message->id)
            ->assertJsonPath('data.0.open_report_count', 1);
    }

    public function test_admin_can_suspend_sender_from_booking_message(): void
    {
        [$admin, , $therapist, , $booking] = $this->createBookingFixture();
        $therapist->createToken('therapist-session');
        $message = BookingMessage::query()
            ->where('booking_id', $booking->id)
            ->where('sender_account_id', $therapist->id)
            ->firstOrFail();

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->postJson("/api/admin/bookings/{$booking->public_id}/messages/{$message->id}/suspend-sender", [
                'reason_code' => 'policy_violation',
                'note' => 'Suspended after repeated direct contact attempts.',
            ])
            ->assertOk()
            ->assertJsonPath('data.public_id', $therapist->public_id)
            ->assertJsonPath('data.status', Account::STATUS_SUSPENDED)
            ->assertJsonPath('data.suspension_reason', 'policy_violation');

        $this->assertDatabaseHas('accounts', [
            'id' => $therapist->id,
            'status' => Account::STATUS_SUSPENDED,
            'suspension_reason' => 'policy_violation',
        ]);
        $this->assertDatabaseMissing('personal_access_tokens', [
            'tokenable_id' => $therapist->id,
            'tokenable_type' => Account::class,
        ]);
        $this->assertDatabaseHas('booking_messages', [
            'id' => $message->id,
            'moderation_status' => BookingMessage::MODERATION_STATUS_ESCALATED,
            'moderated_by_admin_account_id' => $admin->id,
        ]);
        $this->assertDatabaseHas('admin_notes', [
            'target_type' => BookingMessage::class,
            'target_id' => $message->id,
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'account.suspend',
            'target_type' => Account::class,
            'target_id' => $therapist->id,
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'booking.message.suspend_sender',
            'target_type' => BookingMessage::class,
            'target_id' => $message->id,
        ]);

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->getJson("/api/admin/bookings/{$booking->public_id}/messages?sender_account_id={$therapist->public_id}")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.sender.public_id', $therapist->public_id)
            ->assertJsonPath('data.0.sender.status', Account::STATUS_SUSPENDED)
            ->assertJsonPath('data.0.sender.suspension_reason', 'policy_violation');
    }

    private function createBookingFixture(): array
    {
        $admin = Account::factory()->create(['public_id' => 'acc_admin_booking']);
        $admin->roleAssignments()->create([
            'role' => 'admin',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        $user = Account::factory()->create([
            'public_id' => 'acc_user_booking_admin',
            'display_name' => 'Booking User',
            'email' => 'user-booking@example.com',
        ]);
        $therapist = Account::factory()->create([
            'public_id' => 'acc_therapist_booking_admin',
            'display_name' => 'Booking Therapist',
            'email' => 'therapist-booking@example.com',
        ]);

        $therapistProfile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_booking_admin',
            'public_name' => 'Admin Therapist',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
        ]);
        $menu = TherapistMenu::create([
            'public_id' => 'menu_booking_admin_60',
            'therapist_profile_id' => $therapistProfile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
        ]);
        $serviceAddress = ServiceAddress::create([
            'public_id' => 'addr_booking_admin',
            'account_id' => $user->id,
            'label' => 'Hotel',
            'place_type' => 'hotel',
            'prefecture' => 'Tokyo',
            'city' => 'Chiyoda',
            'address_line_encrypted' => Crypt::encryptString('Tokyo Station Hotel 1201'),
            'building_encrypted' => Crypt::encryptString('12F'),
            'access_notes_encrypted' => Crypt::encryptString('Front desk call required.'),
            'lat' => '35.6812360',
            'lng' => '139.7671250',
            'is_default' => true,
        ]);

        $booking = Booking::create([
            'public_id' => 'book_admin_booking',
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $serviceAddress->id,
            'status' => Booking::STATUS_REQUESTED,
            'requested_start_at' => now()->addHour(),
            'scheduled_start_at' => now()->addHour(),
            'scheduled_end_at' => now()->addHours(2),
            'duration_minutes' => 60,
            'request_expires_at' => now()->addMinutes(10),
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
            'user_snapshot_json' => [
                'account_public_id' => $user->public_id,
            ],
            'therapist_snapshot_json' => [
                'account_public_id' => $therapist->public_id,
                'therapist_profile_public_id' => $therapistProfile->public_id,
                'menu_public_id' => $menu->public_id,
            ],
        ]);

        $quote = BookingQuote::create([
            'public_id' => 'quote_admin_booking',
            'booking_id' => $booking->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $menu->id,
            'duration_minutes' => 60,
            'base_amount' => 12000,
            'travel_fee_amount' => 0,
            'night_fee_amount' => 0,
            'demand_fee_amount' => 0,
            'profile_adjustment_amount' => 0,
            'matching_fee_amount' => 300,
            'platform_fee_amount' => 1200,
            'total_amount' => 12300,
            'therapist_gross_amount' => 12000,
            'therapist_net_amount' => 10800,
            'calculation_version' => 'mvp-v1',
            'input_snapshot_json' => [
                'service_address_id' => $serviceAddress->public_id,
            ],
            'applied_rules_json' => [],
            'expires_at' => now()->addMinutes(10),
        ]);
        $booking->forceFill(['current_quote_id' => $quote->id])->save();

        PaymentIntent::create([
            'booking_id' => $booking->id,
            'payer_account_id' => $user->id,
            'stripe_payment_intent_id' => 'pi_admin_booking',
            'status' => 'requires_capture',
            'capture_method' => 'manual',
            'currency' => 'jpy',
            'amount' => 12300,
            'application_fee_amount' => 1500,
            'transfer_amount' => 10800,
            'is_current' => true,
        ]);

        Refund::create([
            'public_id' => 'ref_admin_booking',
            'booking_id' => $booking->id,
            'requested_by_account_id' => $user->id,
            'status' => Refund::STATUS_REQUESTED,
            'reason_code' => 'service_issue',
            'requested_amount' => 5000,
        ]);

        Report::create([
            'public_id' => 'rep_admin_booking',
            'booking_id' => $booking->id,
            'reporter_account_id' => $user->id,
            'target_account_id' => $therapist->id,
            'category' => 'boundary_violation',
            'severity' => Report::SEVERITY_HIGH,
            'status' => Report::STATUS_OPEN,
        ]);
        StripeDispute::create([
            'booking_id' => $booking->id,
            'payment_intent_id' => PaymentIntent::query()->where('booking_id', $booking->id)->value('id'),
            'stripe_dispute_id' => 'dp_admin_booking',
            'status' => StripeDispute::STATUS_NEEDS_RESPONSE,
            'reason' => 'fraudulent',
            'amount' => 12300,
            'currency' => 'jpy',
            'evidence_due_by' => now()->addDays(7),
            'last_stripe_event_id' => 'evt_admin_booking',
        ]);
        BookingMessage::create([
            'booking_id' => $booking->id,
            'sender_account_id' => $user->id,
            'message_type' => 'text',
            'body_encrypted' => Crypt::encryptString('I am in the hotel lobby.'),
            'detected_contact_exchange' => false,
            'moderation_status' => BookingMessage::MODERATION_STATUS_OK,
            'sent_at' => now()->subMinutes(10),
        ]);
        BookingMessage::create([
            'booking_id' => $booking->id,
            'sender_account_id' => $therapist->id,
            'message_type' => 'text',
            'body_encrypted' => Crypt::encryptString('Call me at 090-0000-0000.'),
            'detected_contact_exchange' => true,
            'moderation_status' => BookingMessage::MODERATION_STATUS_BLOCKED,
            'sent_at' => now()->subMinutes(5),
            'read_at' => now()->subMinutes(4),
        ]);

        $booking->statusLogs()->create([
            'to_status' => Booking::STATUS_REQUESTED,
            'actor_account_id' => $user->id,
            'actor_role' => 'user',
            'reason_code' => 'booking_created',
            'metadata_json' => ['ticket' => Str::uuid()->toString()],
            'created_at' => now(),
        ]);

        return [$admin, $user, $therapist, $therapistProfile, $booking->fresh()];
    }
}
