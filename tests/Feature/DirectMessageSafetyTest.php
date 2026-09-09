<?php

namespace Tests\Feature;

use App\Contracts\Payments\CreatedRefund;
use App\Contracts\Payments\PaymentIntentGateway;
use App\Contracts\Payments\PaymentStateGateway;
use App\Contracts\Payments\RefundGateway;
use App\Models\Account;
use App\Models\AccountBlock;
use App\Models\AppNotification;
use App\Models\DirectMessage;
use App\Models\DirectMessageThread;
use App\Models\PaymentIntent;
use App\Models\RoleRelationship;
use App\Services\Bookings\BookingCompletionFollowupService;
use App\Services\DirectMessages\BlockBookingSettlement;
use App\Services\DirectMessages\DirectMessageDelivery;
use App\Services\DirectMessages\DirectMessageMetrics;
use App\Services\DirectMessages\DirectMessageRetention;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class DirectMessageSafetyTest extends TestCase
{
    use RefreshDatabase, \Tests\Concerns\CreatesDirectMessageFixtures;

    protected function setUp(): void
    {
        parent::setUp();
        config(['direct_messages.enabled' => true, 'direct_messages.delivery_enabled' => true]);
        Storage::fake('local');
        Mail::fake();
    }

    private function block(Account $cast, string $relationship): void
    {
        $this->asAccount($cast)->postJson('/api/therapist/relationships/'.$relationship.'/block', ['confirm' => true])->assertOk();
    }

    private function payment($booking, string $status): PaymentIntent
    {
        return PaymentIntent::create(['booking_id' => $booking->id, 'payer_account_id' => $booking->user_account_id, 'stripe_payment_intent_id' => 'pi_'.$booking->public_id, 'status' => $status, 'amount' => 12300]);
    }

    public function test_cast_block_cancels_all_pre_start_bookings_but_preserves_reverse_and_completed(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $data = $this->start($a, $b)->assertCreated()->json('data');
        $bookings = [];
        foreach (['payment_authorizing', 'requested', 'accepted', 'moving', 'arrived'] as $status) {
            $bookings[] = $this->booking($a, $b, $status);
        }
        $reverse = $this->booking($b, $a);
        $completed = $this->booking($a, $b, 'completed');
        $inProgress = $this->booking($a, $b, 'in_progress');
        $this->block($b, $data['thread']['relationship_id']);
        foreach ($bookings as $booking) {
            $this->assertContains($booking->fresh()->status, ['payment_canceled', 'rejected', 'canceled']);
            $this->assertSame('therapist_relationship_block', $booking->fresh()->cancel_reason_code);
        }
        $this->assertSame('accepted', $reverse->fresh()->status);
        $this->assertSame('completed', $completed->fresh()->status);
        $this->assertSame('in_progress', $inProgress->fresh()->status);
        $this->assertDatabaseHas('block_booking_actions', ['booking_id' => $inProgress->id, 'status' => 'review']);
        $this->assertDatabaseCount('block_booking_actions', 6);
        $this->block($b, $data['thread']['relationship_id']);
        $this->assertDatabaseCount('block_booking_actions', 6);
        $this->assertSame(3, $b->therapistProfile->fresh()->therapist_cancellation_count);
        $this->asAccount($a)->postJson('/api/bookings/'.$bookings[2]->public_id.'/messages', ['body' => '送信不可'])->assertConflict();
        $this->asAccount($b)->deleteJson('/api/therapist/relationships/'.$data['thread']['relationship_id'].'/block')->assertOk();
        $this->assertSame('canceled', $bookings[2]->fresh()->status);
        $this->assertDatabaseHas('direct_message_deliveries', ['message_id' => DirectMessage::first()->id, 'status' => 'suppressed']);
    }

    public function test_user_block_does_not_cancel_booking_and_cannot_unblock_casts_block(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $data = $this->start($a, $b)->json('data');
        $booking = $this->booking($a, $b);
        $this->asAccount($a)->postJson('/api/user/relationships/'.$data['thread']['relationship_id'].'/block', ['confirm' => true])->assertOk();
        $this->assertSame('accepted', $booking->fresh()->status);
        $this->assertDatabaseCount('block_booking_actions', 0);
        $this->block($b, $data['thread']['relationship_id']);
        $this->asAccount($a)->deleteJson('/api/user/relationships/'.$data['thread']['relationship_id'].'/block')->assertOk()->assertJsonPath('data.contact_unavailable', true);
    }

    public function test_settlement_voids_authorization_and_refunds_actual_remaining_amount_once(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $data = $this->start($a, $b)->json('data');
        $authBooking = $this->booking($a, $b);
        $paidBooking = $this->booking($a, $b);
        $free = $this->booking($a, $b);
        $free->update(['total_amount' => 0, 'therapist_net_amount' => 0]);
        $auth = $this->payment($authBooking, 'requires_capture');
        $paid = $this->payment($paidBooking, 'succeeded');
        $this->mock(PaymentStateGateway::class, function ($m) use ($auth, $paid) {
            $m->shouldReceive('retrieve')->withArgs(fn ($p) => $p->id === $auth->id)->once()->andReturn(['status' => 'requires_capture', 'refundable_amount' => 0]);
            $m->shouldReceive('retrieve')->withArgs(fn ($p) => $p->id === $paid->id)->once()->andReturn(['status' => 'succeeded', 'refundable_amount' => 9300]);
        });
        $this->mock(PaymentIntentGateway::class, fn ($m) => $m->shouldReceive('cancel')->once()->andReturn('canceled'));
        $this->mock(RefundGateway::class, fn ($m) => $m->shouldReceive('create')->once()->withArgs(fn ($r, $p, $amount) => $r->exists && $p->id === $paid->id && $amount === 9300)->andReturn(new CreatedRefund('re_block', 'succeeded')));
        $this->block($b, $data['thread']['relationship_id']);
        config(['direct_messages.enabled' => false]);
        app(BlockBookingSettlement::class)->run();
        app(BlockBookingSettlement::class)->run();
        $this->assertDatabaseCount('refunds', 1);
        $this->assertDatabaseHas('refunds', ['stripe_refund_id' => 're_block', 'requested_amount' => 9300, 'status' => 'processed']);
        $this->assertSame(3, DB::table('block_booking_actions')->where('status', 'complete')->count());
    }

    public function test_unknown_refund_retries_with_persisted_id_without_undoing_block(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $data = $this->start($a, $b)->json('data');
        $booking = $this->booking($a, $b);
        $this->payment($booking, 'succeeded');
        $this->mock(PaymentStateGateway::class, fn ($m) => $m->shouldReceive('retrieve')->twice()->andReturn(['status' => 'succeeded', 'refundable_amount' => 12300]));
        $ids = [];
        $calls = 0;
        $this->mock(RefundGateway::class, function ($m) use (&$ids, &$calls) {
            $m->shouldReceive('create')->twice()->andReturnUsing(function ($refund) use (&$ids, &$calls) {
                $ids[] = $refund->public_id;
                if (++$calls === 1) {
                    throw new \RuntimeException('timeout');
                }

                return new CreatedRefund('re_retry', 'succeeded');
            });
        });
        $this->block($b, $data['thread']['relationship_id']);
        app(BlockBookingSettlement::class)->run();
        $this->assertDatabaseHas('block_booking_actions', ['booking_id' => $booking->id, 'status' => 'pending']);
        $this->assertNotNull(RoleRelationship::first()->therapist_blocked_at);
        $this->travel(6)->minutes();
        app(BlockBookingSettlement::class)->run();
        $this->assertSame($ids[0], $ids[1]);
        $this->assertDatabaseCount('refunds', 1);
        $this->assertDatabaseHas('block_booking_actions', ['booking_id' => $booking->id, 'status' => 'complete']);
    }

    public function test_in_progress_review_stops_automatic_capture_and_requires_admin_decision(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $data = $this->start($a, $b)->json('data');
        $booking = $this->booking($a, $b, 'therapist_completed');
        $booking->update(['ended_at' => now()->subDays(4)]);
        $this->payment($booking, 'requires_capture');
        $this->mock(PaymentIntentGateway::class, fn ($m) => $m->shouldNotReceive('capture'));
        $this->block($b, $data['thread']['relationship_id']);
        $this->assertSame(0, app(BookingCompletionFollowupService::class)->autoCompleteDueBookings());
        $this->asAccount($a)->postJson('/api/admin/message-operations/'.$booking->public_id, ['decision' => 'release', 'note' => '確認しました'])->assertForbidden();
        $admin = $this->dual('Admin');
        $admin->roleAssignments()->create(['role' => 'admin', 'status' => 'active']);
        $this->asAccount($admin)->postJson('/api/admin/message-operations/'.$booking->public_id, ['decision' => 'release', 'note' => '双方に確認しました'])->assertOk();
        $this->assertDatabaseHas('block_booking_actions', ['booking_id' => $booking->id, 'status' => 'resolved']);
        $this->assertDatabaseHas('admin_audit_logs', ['action' => 'block_booking.release']);
    }

    public function test_report_evidence_survives_sender_image_delete_but_only_audited_admin_can_open_it(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $data = $this->asAccount($a)->post('/api/user/direct-messages', ['target_therapist_profile_id' => $b->therapistProfile->public_id, 'image' => UploadedFile::fake()->image('secret.jpg'), 'client_message_id' => 'proof'], ['Accept' => 'application/json'])->assertCreated()->json('data');
        $report = $this->asAccount($b)->postJson('/api/therapist/direct-messages/'.$data['thread']['public_id'].'/reports', ['message_id' => $data['message']['public_id'], 'category' => 'safety', 'detail' => '確認をお願いします'])->assertCreated()->json('data.public_id');
        $this->asAccount($a)->deleteJson($data['message']['image_url'])->assertOk();
        $this->asAccount($b)->getJson('/api/admin/reports/'.$report.'/dm-evidence')->assertForbidden();
        $admin = $this->dual('Admin');
        $admin->roleAssignments()->create(['role' => 'admin', 'status' => 'active']);
        $this->asAccount($admin)->get('/api/admin/reports/'.$report.'/dm-evidence?image=1')->assertOk()->assertHeader('Cache-Control', 'no-store, private');
        $this->assertDatabaseHas('admin_audit_logs', ['action' => 'dm_evidence.view']);
        $this->assertCount(1, Storage::disk('local')->files('dm-evidence'));
    }

    public function test_expiry_and_withdrawal_are_enforced_before_purge_and_evidence_expires_separately(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $data = $this->start($a, $b)->json('data');
        $message = DirectMessage::first();
        $a->forceFill(['status' => 'withdrawn', 'withdrawn_at' => now()->subDays(91)])->save();
        $this->asAccount($b)->getJson('/api/therapist/direct-messages/'.$data['thread']['public_id'])->assertOk()->assertJsonPath('data.0.body', null)->assertJsonPath('meta.thread.counterparty.display_name', '退会済み');
        $this->getJson('/api/therapist/direct-messages/summary')->assertOk()->assertJsonPath('data.unread_count', 0);
        $this->assertSame(1, app(DirectMessageRetention::class)->run());
        $this->assertNull($message->fresh()->body_encrypted);
        $this->assertDatabaseHas('dm_deletions', ['subject_public_id' => $message->public_id]);
    }

    public function test_notifications_filter_by_role_and_read_all_does_not_touch_the_other_role(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $this->start($a, $b);
        $this->start($b, $a);
        $this->asAccount($a)->getJson('/api/notifications?role=user')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/notifications?role=therapist')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.data.target_role', 'therapist');
        $this->postJson('/api/notifications/read-all?role=user')->assertOk();
        $this->assertNull(AppNotification::where('account_id', $a->id)->first()->read_at);
        $this->getJson('/api/notifications')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_delivery_groups_messages_and_suppresses_read_or_muted_messages(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $data = $this->start($a, $b)->json('data');
        $this->start($a, $b, 'two');
        $this->travel(6)->minutes();
        app(DirectMessageDelivery::class)->run();
        $this->assertSame(2, DB::table('direct_message_deliveries')->where('channel', 'email')->where('status', 'sent')->count());
        $this->start($a, $b, 'three');
        $this->asAccount($b)->patchJson('/api/therapist/direct-messages/'.$data['thread']['public_id'].'/preferences', ['muted' => true])->assertOk();
        $this->travel(6)->minutes();
        app(DirectMessageDelivery::class)->run();
        $this->assertSame(1, DB::table('direct_message_deliveries')->where('channel', 'email')->where('status', 'suppressed')->count());
    }

    public function test_validation_limits_and_activity_ordered_pagination(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $this->asAccount($a)->postJson('/api/user/direct-messages', ['target_therapist_profile_id' => $b->therapistProfile->public_id, 'body' => str_repeat('あ', 1001), 'client_message_id' => 'long'])->assertUnprocessable();
        $this->assertDatabaseCount('direct_messages', 0);
        $first = $this->start($a, $b)->assertCreated()->json('data.thread.public_id');
        for ($i = 0; $i < 4; $i++) {
            $this->start($a, $this->dual('C'.$i))->assertCreated();
        }
        $this->start($a, $this->dual('Limit'))->assertStatus(429);
        config(['direct_messages.new_contacts_per_day' => 100, 'direct_messages.messages_per_minute' => 100]);
        for ($i = 4; $i < 30; $i++) {
            $this->start($a, $this->dual('C'.$i))->assertCreated();
        }
        $this->travel(1)->seconds();
        $this->start($a, $b, 'newest')->assertCreated();
        $page = $this->getJson('/api/user/direct-messages')->assertOk()->assertJsonCount(30, 'data')->assertJsonPath('data.0.public_id', $first)->json();
        $this->getJson('/api/user/direct-messages?cursor='.urlencode($page['meta']['next_cursor']))->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_minute_limit_includes_messages_sent_in_both_roles(): void
    {
        config(['direct_messages.before_reply_limit' => 100]);
        $a = $this->dual('A');
        $b = $this->dual('B');
        $one = $this->start($a, $b)->assertCreated()->json('data.thread.public_id');
        $two = $this->start($b, $a)->assertCreated()->json('data.thread.public_id');
        for ($i = 1; $i < 20; $i++) {
            $this->asAccount($a)->postJson('/api/therapist/direct-messages/'.$two.'/messages', ['body' => '返信です', 'client_message_id' => 'reply'.$i])->assertCreated();
        }
        $this->asAccount($a)->postJson('/api/user/direct-messages/'.$one.'/messages', ['body' => '追加です', 'client_message_id' => 'limit'])->assertStatus(429);
    }

    public function test_metric_conversion_does_not_count_reverse_role_booking_and_uses_mature_cohorts(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $this->start($a, $b)->assertCreated();
        $thread = DirectMessageThread::first();
        $thread->update(['created_at' => now()->subDays(31), 'first_reply_at' => now()->subDays(31)->addHour()]);
        $reverse = $this->booking($b, $a, 'completed');
        $reverse->update(['created_at' => now()->subDays(29), 'completed_at' => now()->subDays(28)]);
        $metrics = app(DirectMessageMetrics::class)->summarize()['groups']['normal'];
        $this->assertSame(1, $metrics['booking_observed_7d']);
        $this->assertSame(0, $metrics['booked_within_7d']);
        $this->assertSame(0, $metrics['completed_within_30d']);
        $same = $this->booking($a, $b, 'completed');
        $same->update(['created_at' => now()->subDays(29), 'completed_at' => now()->subDays(28)]);
        $metrics = app(DirectMessageMetrics::class)->summarize()['groups']['normal'];
        $this->assertSame(1, $metrics['booked_within_7d']);
        $this->assertSame(1, $metrics['completed_within_30d']);
        $this->assertSame(1, $metrics['paid_bookings']);
    }

    public function test_migration_preserves_closed_booking_messages_and_legacy_blocks(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $booking = $this->booking($a, $b, 'completed');
        $booking->update(['messages_closed_at' => now()]);
        $message = $booking->messages()->create(['sender_account_id' => $a->id, 'message_type' => 'text', 'body_encrypted' => Crypt::encryptString('旧予約の本文'), 'sent_at' => now()]);
        AccountBlock::create(['blocker_account_id' => $b->id, 'blocked_account_id' => $a->id]);
        $before = DB::table('booking_messages')->where('id', $message->id)->first();
        $migration = require database_path('migrations/2026_09_08_000001_create_direct_messaging.php');
        $migration->down();
        $migration->up();
        $this->assertEquals($before, DB::table('booking_messages')->where('id', $message->id)->first());
        $this->assertNotNull($booking->fresh()->messages_closed_at);
        $this->assertDatabaseCount('account_blocks', 1);
        $this->assertDatabaseCount('direct_message_threads', 0);
        $this->assertFalse($b->therapistProfile->fresh()->consultation_enabled);
    }
}
