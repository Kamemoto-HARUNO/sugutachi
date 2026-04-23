<?php

namespace Tests\Feature;

use App\Contracts\Payments\CreatedRefund;
use App\Contracts\Payments\RefundGateway;
use App\Models\Account;
use App\Models\Booking;
use App\Models\PaymentIntent;
use App\Models\Refund;
use App\Models\ServiceAddress;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Assert;
use Tests\TestCase;

class AdminRefundRequestTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_and_approve_refund_request_with_stripe_refund(): void
    {
        $this->app->bind(RefundGateway::class, fn () => new class implements RefundGateway
        {
            public function create(Refund $refund, PaymentIntent $paymentIntent, int $amount): CreatedRefund
            {
                Assert::assertSame('ref_admin', $refund->public_id);
                Assert::assertSame('pi_admin_refund', $paymentIntent->stripe_payment_intent_id);
                Assert::assertSame(5000, $amount);

                return new CreatedRefund(id: 're_admin_123', status: 'succeeded');
            }
        });

        [$admin, $refund] = $this->createAdminRefundFixture();
        $token = $admin->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/admin/refund-requests')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $refund->public_id);

        $this->withToken($token)
            ->postJson("/api/admin/refund-requests/{$refund->public_id}/approve", [
                'approved_amount' => 5000,
            ])
            ->assertOk()
            ->assertJsonPath('data.status', Refund::STATUS_PROCESSED)
            ->assertJsonPath('data.approved_amount', 5000)
            ->assertJsonPath('data.stripe_refund_id', 're_admin_123');

        $this->assertDatabaseHas('refunds', [
            'id' => $refund->id,
            'status' => Refund::STATUS_PROCESSED,
            'approved_amount' => 5000,
            'stripe_refund_id' => 're_admin_123',
            'reviewed_by_account_id' => $admin->id,
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'refund.approve',
            'target_type' => Refund::class,
            'target_id' => $refund->id,
        ]);
    }

    public function test_admin_can_reject_refund_request_without_calling_gateway(): void
    {
        $this->app->bind(RefundGateway::class, fn () => new class implements RefundGateway
        {
            public function create(Refund $refund, PaymentIntent $paymentIntent, int $amount): CreatedRefund
            {
                Assert::fail('Refund gateway should not be called when rejecting.');
            }
        });

        [$admin, $refund] = $this->createAdminRefundFixture();

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->postJson("/api/admin/refund-requests/{$refund->public_id}/reject", [
                'reason_code' => 'not_eligible',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', Refund::STATUS_REJECTED)
            ->assertJsonPath('data.reason_code', 'not_eligible');

        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'refund.reject',
            'target_type' => Refund::class,
            'target_id' => $refund->id,
        ]);
    }

    public function test_non_admin_cannot_access_admin_refund_requests(): void
    {
        [, $refund, $user] = $this->createAdminRefundFixture();

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/admin/refund-requests/{$refund->public_id}/approve", [
                'approved_amount' => 5000,
            ])
            ->assertForbidden();
    }

    private function createAdminRefundFixture(): array
    {
        $admin = Account::factory()->create(['public_id' => 'acc_admin_refund']);
        $admin->roleAssignments()->create([
            'role' => 'admin',
            'status' => 'active',
            'granted_at' => now(),
        ]);
        $user = Account::factory()->create(['public_id' => 'acc_user_admin_refund']);
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_admin_refund']);

        $therapistProfile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_admin_refund',
            'public_name' => 'Admin Refund Therapist',
            'profile_status' => 'approved',
        ]);

        $menu = TherapistMenu::create([
            'public_id' => 'menu_admin_refund_60',
            'therapist_profile_id' => $therapistProfile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
        ]);

        $address = ServiceAddress::create([
            'public_id' => 'addr_admin_refund',
            'account_id' => $user->id,
            'place_type' => 'hotel',
            'address_line_encrypted' => 'encrypted-address',
            'lat' => '35.6812360',
            'lng' => '139.7671250',
        ]);

        $booking = Booking::create([
            'public_id' => 'book_admin_refund',
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $address->id,
            'status' => Booking::STATUS_COMPLETED,
            'duration_minutes' => 60,
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);

        $paymentIntent = PaymentIntent::create([
            'booking_id' => $booking->id,
            'payer_account_id' => $user->id,
            'stripe_payment_intent_id' => 'pi_admin_refund',
            'status' => PaymentIntent::STRIPE_STATUS_SUCCEEDED,
            'capture_method' => 'manual',
            'currency' => 'jpy',
            'amount' => 12300,
            'application_fee_amount' => 1500,
            'transfer_amount' => 10800,
            'is_current' => true,
            'captured_at' => now(),
        ]);

        $refund = Refund::create([
            'public_id' => 'ref_admin',
            'booking_id' => $booking->id,
            'payment_intent_id' => $paymentIntent->id,
            'requested_by_account_id' => $user->id,
            'status' => Refund::STATUS_REQUESTED,
            'reason_code' => 'service_issue',
            'requested_amount' => 8000,
        ]);

        return [$admin, $refund, $user];
    }
}
