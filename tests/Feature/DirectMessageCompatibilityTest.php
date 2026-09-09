<?php

namespace Tests\Feature;

use App\Contracts\Payments\CreatedRefund;
use App\Contracts\Payments\PaymentStateGateway;
use App\Contracts\Payments\RefundGateway;
use App\Models\Account;
use App\Models\AppNotification;
use App\Models\PaymentIntent;
use App\Models\Refund;
use App\Models\StripeDispute;
use App\Services\DirectMessages\BlockBookingSettlement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\CreatesDirectMessageFixtures;
use Tests\TestCase;

class DirectMessageCompatibilityTest extends TestCase
{
    use CreatesDirectMessageFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['direct_messages.enabled' => true, 'direct_messages.delivery_enabled' => false]);
    }

    public function test_existing_refund_or_dispute_is_reviewed_instead_of_automatically_refunded(): void
    {
        $user = $this->dual('A');
        $cast = $this->dual('B');
        $relation = $this->start($user, $cast)->assertCreated()->json('data.thread.relationship_id');
        $refundBooking = $this->booking($user, $cast);
        $disputeBooking = $this->booking($user, $cast);
        $refundBooking->refunds()->create(['public_id' => 'ref_pending', 'requested_by_account_id' => $user->id, 'reason_code' => 'service_issue', 'status' => 'requested', 'requested_amount' => 3000]);
        $disputeBooking->disputes()->create(['stripe_dispute_id' => 'dp_pending', 'status' => StripeDispute::STATUS_NEEDS_RESPONSE, 'amount' => 12300, 'currency' => 'jpy']);

        $preview = $this->asAccount($cast)->getJson('/api/therapist/relationships/'.$relation)->assertOk();
        $this->assertTrue(collect($preview->json('data.affected_bookings'))->every('requires_review', true));
        $this->postJson('/api/therapist/relationships/'.$relation.'/block', ['confirm' => true])->assertOk();
        foreach ([$refundBooking, $disputeBooking] as $booking) {
            $this->assertDatabaseHas('block_booking_actions', ['booking_id' => $booking->id, 'status' => 'review']);
            $this->assertSame('accepted', $booking->fresh()->status);
        }
        $this->mock(PaymentStateGateway::class, fn ($mock) => $mock->shouldNotReceive('retrieve'));
        $this->mock(RefundGateway::class, fn ($mock) => $mock->shouldNotReceive('create'));
        app(BlockBookingSettlement::class)->run();
        $this->assertDatabaseCount('refunds', 1);

        $this->asAccount($user)->postJson('/api/bookings/'.$refundBooking->public_id.'/cancel', ['reason_code' => 'schedule_change'])->assertConflict();
        $this->assertSame('accepted', $refundBooking->fresh()->status);
    }

    public function test_regular_refund_approval_waits_for_block_review_and_resumes_after_release(): void
    {
        $user = $this->dual('A');
        $cast = $this->dual('B');
        $admin = Account::factory()->create();
        $admin->roleAssignments()->create(['role' => 'admin', 'status' => 'active']);
        $relation = $this->start($user, $cast)->assertCreated()->json('data.thread.relationship_id');
        $booking = $this->booking($user, $cast, 'therapist_completed');
        $payment = PaymentIntent::create(['booking_id' => $booking->id, 'payer_account_id' => $user->id, 'stripe_payment_intent_id' => 'pi_review', 'status' => 'succeeded', 'amount' => 12300]);
        $refund = $booking->refunds()->create(['public_id' => 'ref_review', 'payment_intent_id' => $payment->id, 'requested_by_account_id' => $user->id, 'reason_code' => 'service_issue', 'status' => Refund::STATUS_REQUESTED, 'requested_amount' => 3000]);
        $this->asAccount($cast)->postJson('/api/therapist/relationships/'.$relation.'/block', ['confirm' => true])->assertOk();
        $this->mock(RefundGateway::class, fn ($mock) => $mock->shouldNotReceive('create'));
        $this->asAccount($admin)->postJson('/api/admin/refund-requests/'.$refund->public_id.'/approve', ['approved_amount' => 3000])->assertConflict();
        $this->assertSame('requested', $refund->fresh()->status);
        $this->postJson('/api/admin/message-operations/'.$booking->public_id, ['decision' => 'release', 'note' => '既存の返金申請で精算します'])->assertOk();
        $this->mock(RefundGateway::class, fn ($mock) => $mock->shouldReceive('create')->once()->andReturn(new CreatedRefund('re_existing', 'succeeded')));
        $this->postJson('/api/admin/refund-requests/'.$refund->public_id.'/approve', ['approved_amount' => 3000])->assertOk();
        $this->assertSame('processed', $refund->fresh()->status);
    }

    public function test_dispute_arriving_after_block_prevents_the_pending_worker_from_refunding(): void
    {
        $user = $this->dual('A');
        $cast = $this->dual('B');
        $relation = $this->start($user, $cast)->assertCreated()->json('data.thread.relationship_id');
        $booking = $this->booking($user, $cast);
        PaymentIntent::create(['booking_id' => $booking->id, 'payer_account_id' => $user->id, 'stripe_payment_intent_id' => 'pi_late_dispute', 'status' => 'succeeded', 'amount' => 12300]);
        $this->asAccount($cast)->postJson('/api/therapist/relationships/'.$relation.'/block', ['confirm' => true])->assertOk();
        $booking->disputes()->create(['stripe_dispute_id' => 'dp_late', 'status' => StripeDispute::STATUS_UNDER_REVIEW, 'amount' => 12300, 'currency' => 'jpy']);
        $this->mock(PaymentStateGateway::class, fn ($mock) => $mock->shouldNotReceive('retrieve'));
        $this->mock(RefundGateway::class, fn ($mock) => $mock->shouldNotReceive('create'));
        app(BlockBookingSettlement::class)->run();
        $this->assertDatabaseHas('block_booking_actions', ['booking_id' => $booking->id, 'status' => 'review']);
        $this->assertDatabaseCount('refunds', 0);
    }

    public function test_reblocking_after_admin_release_requires_a_new_review(): void
    {
        $user = $this->dual('A');
        $cast = $this->dual('B');
        $admin = Account::factory()->create();
        $admin->roleAssignments()->create(['role' => 'admin', 'status' => 'active']);
        $relation = $this->start($user, $cast)->assertCreated()->json('data.thread.relationship_id');
        $booking = $this->booking($user, $cast, 'in_progress');
        $this->asAccount($cast)->postJson('/api/therapist/relationships/'.$relation.'/block', ['confirm' => true])->assertOk();
        $this->asAccount($admin)->postJson('/api/admin/message-operations/'.$booking->public_id, ['decision' => 'release', 'note' => '確認したため精算保留を解除します'])->assertOk();
        $this->asAccount($cast)->deleteJson('/api/therapist/relationships/'.$relation.'/block')->assertOk();
        $this->postJson('/api/therapist/relationships/'.$relation.'/block', ['confirm' => true])->assertOk();
        $this->assertDatabaseHas('block_booking_actions', ['booking_id' => $booking->id, 'status' => 'review', 'completed_at' => null]);
        $this->assertSame(2, AppNotification::where('account_id', $admin->id)->where('notification_type', 'dm_system_notice')->count());
    }
}
