<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\PaymentIntent;
use App\Models\Refund;
use App\Models\ServiceAddress;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RefundRequestTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_create_refund_request_for_completed_booking(): void
    {
        $admin = Account::factory()->create(['public_id' => 'acc_admin_refund_notice']);
        $admin->roleAssignments()->create([
            'role' => 'admin',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        [$user, , $booking, $paymentIntent] = $this->createRefundFixture(Booking::STATUS_COMPLETED);

        $refundId = $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/refund-requests", [
                'reason_code' => 'service_issue',
                'detail' => 'The service ended early.',
                'requested_amount' => 5000,
            ])
            ->assertCreated()
            ->assertJsonPath('data.booking_public_id', $booking->public_id)
            ->assertJsonPath('data.status', Refund::STATUS_REQUESTED)
            ->assertJsonPath('data.reason_code', 'service_issue')
            ->assertJsonPath('data.requested_amount', 5000)
            ->json('data.public_id');

        $this->assertDatabaseHas('refunds', [
            'public_id' => $refundId,
            'booking_id' => $booking->id,
            'payment_intent_id' => $paymentIntent->id,
            'requested_by_account_id' => $user->id,
            'status' => Refund::STATUS_REQUESTED,
            'reason_code' => 'service_issue',
            'requested_amount' => 5000,
        ]);
        $this->assertDatabaseHas('notifications', [
            'account_id' => $admin->id,
            'notification_type' => 'refund_requested',
            'channel' => 'in_app',
            'status' => AppNotification::STATUS_SENT,
        ]);
    }

    public function test_therapist_can_list_and_show_refund_requests_but_cannot_create_them(): void
    {
        [$user, $therapist, $booking] = $this->createRefundFixture(Booking::STATUS_COMPLETED);

        $refund = Refund::create([
            'public_id' => 'ref_existing',
            'booking_id' => $booking->id,
            'requested_by_account_id' => $user->id,
            'status' => Refund::STATUS_REQUESTED,
            'reason_code' => 'service_issue',
            'requested_amount' => 5000,
        ]);

        $therapistToken = $therapist->createToken('api')->plainTextToken;

        $this->withToken($therapistToken)
            ->getJson("/api/bookings/{$booking->public_id}/refund-requests")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $refund->public_id);

        $this->withToken($therapistToken)
            ->getJson("/api/refund-requests/{$refund->public_id}")
            ->assertOk()
            ->assertJsonPath('data.public_id', $refund->public_id);

        $this->withToken($therapistToken)
            ->postJson("/api/bookings/{$booking->public_id}/refund-requests", [
                'reason_code' => 'service_issue',
            ])
            ->assertNotFound();
    }

    public function test_refund_request_requires_refundable_booking_status(): void
    {
        [$user, , $booking] = $this->createRefundFixture(Booking::STATUS_ACCEPTED);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/refund-requests", [
                'reason_code' => 'service_issue',
            ])
            ->assertConflict();
    }

    private function createRefundFixture(string $status): array
    {
        $user = Account::factory()->create(['public_id' => 'acc_user_refund']);
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_refund']);

        $therapistProfile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_refund',
            'public_name' => 'Refund Therapist',
            'profile_status' => 'approved',
        ]);

        $menu = TherapistMenu::create([
            'public_id' => 'menu_refund_60',
            'therapist_profile_id' => $therapistProfile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
        ]);

        $address = ServiceAddress::create([
            'public_id' => 'addr_refund',
            'account_id' => $user->id,
            'place_type' => 'hotel',
            'address_line_encrypted' => 'encrypted-address',
            'lat' => '35.6812360',
            'lng' => '139.7671250',
        ]);

        $booking = Booking::create([
            'public_id' => 'book_refund',
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $address->id,
            'status' => $status,
            'duration_minutes' => 60,
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);

        $paymentIntent = PaymentIntent::create([
            'booking_id' => $booking->id,
            'payer_account_id' => $user->id,
            'stripe_payment_intent_id' => 'pi_refund',
            'status' => PaymentIntent::STRIPE_STATUS_SUCCEEDED,
            'capture_method' => 'manual',
            'currency' => 'jpy',
            'amount' => 12300,
            'application_fee_amount' => 1500,
            'transfer_amount' => 10800,
            'is_current' => true,
            'captured_at' => now(),
        ]);

        return [$user, $therapist, $booking, $paymentIntent];
    }
}
