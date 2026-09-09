<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\AppNotification;
use App\Models\BookingMessage;
use App\Models\DirectMessage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\Concerns\CreatesDirectMessageFixtures;
use Tests\TestCase;

class NotificationInboxTest extends TestCase
{
    use CreatesDirectMessageFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['direct_messages.enabled' => true]);
        Mail::fake();
    }

    private function notice(Account $account, array $data, string $type = 'test_notice'): AppNotification
    {
        return AppNotification::create(['account_id' => $account->id, 'notification_type' => $type,
            'channel' => 'in_app', 'title' => '確認用のお知らせ', 'body' => '内容', 'data_json' => $data,
            'status' => 'sent', 'sent_at' => now()]);
    }

    public function test_legacy_paths_shared_and_unknown_are_scoped_identically_for_list_badge_and_reads(): void
    {
        $a = $this->dual('A');
        $cast = $this->notice($a, ['target_path' => '/therapist/bookings']);
        $user = $this->notice($a, ['target_path' => '/user/bookings']);
        $shared = $this->notice($a, ['target_role' => 'shared']);
        $unknown = $this->notice($a, []);
        $this->notice($a, ['target_path' => '/user-other/private']);
        $this->asAccount($a)->getJson('/api/notifications?role=user')->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('meta.unread_count', 2);
        $this->postJson('/api/notifications/'.$cast->id.'/read?role=user')->assertNotFound();
        $this->postJson('/api/notifications/read-all?role=user')->assertOk()->assertJsonPath('data.updated_count', 2);
        $this->assertNull($cast->fresh()->read_at);
        $this->assertNull($unknown->fresh()->read_at);
        $this->assertNotNull($user->fresh()->read_at);
        $this->assertNotNull($shared->fresh()->read_at);
        $this->getJson('/api/notifications?role=therapist')->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('meta.unread_count', 1);
        $a->roleAssignments()->where('role', 'therapist')->update(['revoked_at' => now()]);
        $this->getJson('/api/notifications?role=therapist')->assertForbidden();
    }

    public function test_dm_read_syncs_only_the_received_messages_and_reverse_role_remains_unread(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $one = $this->start($a, $b)->assertCreated()->json('data');
        $thread = $one['thread']['public_id'];
        $two = $this->asAccount($a)->postJson('/api/user/direct-messages/'.$thread.'/messages', ['body' => 'もう一つ質問です', 'client_message_id' => 'second'])->assertCreated()->json('data.message.public_id');
        $reverse = $this->start($b, $a)->assertCreated()->json('data');
        $this->asAccount($a)->postJson('/api/therapist/direct-messages/'.$reverse['thread']['public_id'].'/messages', ['body' => 'ありがとうございます', 'client_message_id' => 'reply'])->assertCreated();
        $this->asAccount($b)->getJson('/api/notifications?role=therapist')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.unread_message_count', 2)->assertJsonPath('meta.unread_count', 1);
        $this->postJson('/api/therapist/direct-messages/'.$thread.'/read', ['message_ids' => [$one['message']['public_id']]])->assertOk();
        $this->getJson('/api/notifications?role=therapist')->assertJsonPath('data.0.unread_message_count', 1);
        $this->getJson('/api/notifications?role=user')->assertJsonPath('meta.unread_count', 1);
        $this->postJson('/api/therapist/direct-messages/'.$thread.'/read', ['message_ids' => [$two]])->assertOk();
        $this->getJson('/api/notifications?role=therapist&read_status=unread')->assertJsonCount(0, 'data')->assertJsonPath('meta.unread_count', 0);
        $this->getJson('/api/notifications?role=therapist')->assertJsonCount(1, 'data')->assertJsonPath('data.0.is_read', true);
    }

    public function test_opening_a_group_does_not_read_messages_or_a_concurrent_arrival(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $one = $this->start($a, $b)->assertCreated()->json('data');
        $thread = $one['thread']['public_id'];
        $cardId = $this->asAccount($b)->getJson('/api/notifications?role=therapist')->json('data.0.id');
        $this->asAccount($a)->postJson('/api/user/direct-messages/'.$thread.'/messages', ['body' => '追加です', 'client_message_id' => 'later'])->assertCreated();
        $this->asAccount($b)->postJson('/api/notifications/'.$cardId.'/read?role=therapist')->assertOk();
        $this->assertSame(2, DirectMessage::whereNull('read_at')->count());
        $this->getJson('/api/notifications?role=therapist')->assertJsonCount(1, 'data')->assertJsonPath('data.0.unread_message_count', 1)->assertJsonPath('data.0.is_read', false);
    }

    public function test_read_all_is_bounded_to_the_rendered_snapshot(): void
    {
        $a = $this->dual('A');
        $this->notice($a, ['target_role' => 'user']);
        $snapshot = $this->asAccount($a)->getJson('/api/notifications?role=user')->json('meta.snapshot_id');
        $later = $this->notice($a, ['target_role' => 'user']);
        $this->postJson('/api/notifications/read-all?role=user', ['through_id' => $snapshot])->assertOk()->assertJsonPath('data.unread_count', 1);
        $this->assertNull($later->fresh()->read_at);
    }

    public function test_reservations_have_separate_groups_and_read_receipts_sync_notifications(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $first = $this->booking($a, $b);
        $second = $this->booking($a, $b);
        $one = $this->asAccount($a)->postJson('/api/bookings/'.$first->public_id.'/messages', ['body' => 'よろしくお願いします'])->assertCreated()->json('id');
        // Resource responses may be wrapped depending on the endpoint.
        $one = $one ?: BookingMessage::where('booking_id', $first->id)->firstOrFail()->id;
        $this->postJson('/api/bookings/'.$first->public_id.'/messages', ['body' => '当日の確認です'])->assertCreated();
        $this->postJson('/api/bookings/'.$second->public_id.'/messages', ['body' => '別の日の確認です'])->assertCreated();
        $important = $this->notice($b, ['target_role' => 'therapist', 'booking_public_id' => $first->public_id], 'booking_confirmed');
        $this->asAccount($b)->getJson('/api/notifications?role=therapist')->assertOk()->assertJsonCount(3, 'data')->assertJsonPath('meta.unread_count', 3);
        $this->postJson('/api/bookings/'.$first->public_id.'/messages/'.$one.'/read')->assertOk();
        $this->assertNotNull(AppNotification::where('notification_type', 'booking_message_received')->where('data_json->message_id', $one)->firstOrFail()->read_at);
        $this->assertNull($important->fresh()->read_at);
        $this->assertNull(BookingMessage::where('booking_id', $second->id)->firstOrFail()->read_at);
    }

    public function test_reconciliation_preserves_rows_and_marks_only_previously_read_message_notifications(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $one = $this->start($a, $b)->assertCreated()->json('data');
        DirectMessage::where('public_id', $one['message']['public_id'])->update(['read_at' => now()]);
        $notice = AppNotification::firstOrFail();
        DB::table('notifications')->where('id', $notice->id)->update(['audience_role' => null, 'conversation_key' => null]);
        $unknown = $this->notice($b, []);
        $this->artisan('notifications:reconcile-inbox')->assertSuccessful();
        $this->assertDatabaseCount('notifications', 2);
        $this->assertNotNull($notice->fresh()->read_at);
        $this->assertSame('therapist', $notice->fresh()->audience_role);
        $this->assertNull($unknown->fresh()->read_at);
        $this->assertSame('unknown', $unknown->fresh()->audience_role);
        $this->artisan('notifications:reconcile-inbox')->assertSuccessful();
        $this->assertDatabaseCount('notifications', 2);
    }

    public function test_grouping_precedes_limit_and_an_older_unread_message_keeps_the_card_unread(): void
    {
        $a = $this->dual('A');
        $data = ['target_role' => 'user', 'target_path' => '/user/direct-messages/dmt_history'];
        $other = $this->notice($a, ['target_role' => 'user'], 'booking_accepted');
        for ($i = 0; $i < 105; $i++) {
            $last = $this->notice($a, $data, 'direct_message_received');
        }
        $last->update(['read_at' => now(), 'status' => 'read']);
        $response = $this->asAccount($a)->getJson('/api/notifications?role=user&limit=2')->assertOk()
            ->assertJsonCount(2, 'data')->assertJsonPath('meta.unread_count', 2)
            ->assertJsonPath('data.0.is_read', false)->assertJsonPath('data.0.unread_message_count', 104)
            ->assertJsonPath('data.1.id', $other->id);
        $this->getJson('/api/notifications?role=user&read_status=read')->assertJsonCount(0, 'data');
        $this->postJson('/api/notifications/'.$last->id.'/read?role=user')->assertOk();
        $this->getJson('/api/notifications?role=user&limit=2')->assertJsonPath('data.0.is_read', true);
        $fresh = $this->notice($a, $data, 'direct_message_received');
        $this->getJson('/api/notifications?role=user&limit=2')->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.id', $fresh->id)->assertJsonPath('data.0.unread_message_count', 1);
    }
}
