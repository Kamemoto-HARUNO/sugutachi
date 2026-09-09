<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\AppNotification;
use App\Models\BookingMessage;
use App\Models\DirectMessage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Mail;
use Tests\Concerns\CreatesDirectMessageFixtures;
use Tests\TestCase;

class UnreadSummaryTest extends TestCase
{
    use CreatesDirectMessageFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['direct_messages.enabled' => true]);
        Mail::fake();
    }

    private function notice(Account $account, string $role): AppNotification
    {
        return AppNotification::create(['account_id' => $account->id, 'notification_type' => 'test_notice',
            'channel' => 'in_app', 'title' => 'お知らせ', 'body' => '内容', 'data_json' => ['target_role' => $role],
            'status' => 'sent', 'sent_at' => now()]);
    }

    public function test_roles_count_messages_and_notifications_without_counting_the_same_conversation_twice(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $one = $this->start($a, $b)->assertCreated()->json('data');
        $this->postJson('/api/user/direct-messages/'.$one['thread']['public_id'].'/messages', ['body' => '追加質問', 'client_message_id' => 'second'])->assertCreated();
        $reverse = $this->start($b, $a)->assertCreated()->json('data');
        $this->asAccount($a)->postJson('/api/therapist/direct-messages/'.$reverse['thread']['public_id'].'/messages', ['body' => '返信', 'client_message_id' => 'reply'])->assertCreated();
        $this->notice($b, 'user');
        $this->notice($b, 'shared');
        $this->notice($a, 'therapist');
        $this->asAccount($b)->getJson('/api/me/unread-summary')->assertOk()->assertExactJson(['data' => ['roles' => [
            'user' => ['messages' => 1, 'notifications' => 3, 'total' => 3],
            'therapist' => ['messages' => 2, 'notifications' => 2, 'total' => 3],
        ]]]);
        $this->getJson('/api/notifications?role=therapist')->assertJsonPath('meta.unread_count', 2);
        $this->getJson('/api/therapist/direct-messages/summary')->assertJsonPath('data.unread_count', 2);
        $this->postJson('/api/notifications/read-all?role=therapist')->assertOk();
        $this->getJson('/api/me/unread-summary')->assertJsonPath('data.roles.therapist.total', 2)->assertJsonPath('data.roles.therapist.notifications', 0);
        $this->postJson('/api/therapist/direct-messages/'.$one['thread']['public_id'].'/read', ['message_ids' => [$one['message']['public_id']]])->assertOk();
        $this->getJson('/api/me/unread-summary')->assertJsonPath('data.roles.therapist.total', 1)->assertJsonPath('data.roles.user.total', 2);
    }

    public function test_only_active_owned_roles_are_returned_and_no_details_or_other_accounts_leak(): void
    {
        $this->getJson('/api/me/unread-summary')->assertUnauthorized();
        $a = $this->dual('A');
        $b = $this->dual('B');
        $a->roleAssignments()->create(['role' => 'admin', 'status' => 'active']);
        $a->roleAssignments()->where('role', 'therapist')->update(['revoked_at' => now()]);
        $this->notice($a, 'therapist');
        $this->notice($a, 'admin');
        $this->notice($b, 'user');
        $this->asAccount($a)->getJson('/api/me/unread-summary?account_id='.$b->id)->assertOk()->assertExactJson(['data' => ['roles' => [
            'user' => ['messages' => 0, 'notifications' => 0, 'total' => 0],
            'admin' => ['messages' => 0, 'notifications' => 1, 'total' => 1],
        ]]]);
        $a->roleAssignments()->where('role', 'admin')->update(['status' => 'inactive']);
        $this->getJson('/api/me/unread-summary')->assertJsonMissingPath('data.roles.admin');
        $a->update(['status' => Account::STATUS_SUSPENDED]);
        $this->asAccount($a)->getJson('/api/me/unread-summary')->assertForbidden();
    }

    public function test_booking_messages_match_visibility_and_receipts_update_the_combined_count(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $booking = $this->booking($a, $b);
        $this->asAccount($b)->postJson('/api/bookings/'.$booking->public_id.'/messages', ['body' => '予約について'])->assertCreated();
        $message = BookingMessage::firstOrFail();
        $this->asAccount($a)->getJson('/api/me/unread-summary')->assertJsonPath('data.roles.user.messages', 1)->assertJsonPath('data.roles.user.total', 1);
        $this->postJson('/api/bookings/'.$booking->public_id.'/messages/'.$message->id.'/read')->assertOk();
        $this->getJson('/api/me/unread-summary')->assertJsonPath('data.roles.user.total', 0);
        $message->update(['read_at' => null]);
        $booking->update(['messages_closed_at' => now(), 'messages_closed_by_account_id' => $b->id]);
        $this->getJson('/api/me/unread-summary')->assertJsonPath('data.roles.user.messages', 0);
        BookingMessage::create(['booking_id' => $booking->id, 'sender_account_id' => $a->id, 'message_type' => 'text', 'body_encrypted' => Crypt::encryptString('確認'), 'sent_at' => now()]);
        $this->asAccount($b)->getJson('/api/me/unread-summary')->assertJsonPath('data.roles.therapist.messages', 1)->assertJsonPath('data.roles.therapist.total', 1);
    }

    public function test_deleted_or_expired_dm_content_does_not_count_as_an_unread_message(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $one = $this->start($a, $b)->assertCreated()->json('data');
        $this->asAccount($b)->postJson('/api/notifications/read-all?role=therapist')->assertOk();
        DirectMessage::where('public_id', $one['message']['public_id'])->update(['deleted_at' => now()]);
        $this->getJson('/api/me/unread-summary')->assertJsonPath('data.roles.therapist.total', 0);
        DirectMessage::query()->update(['deleted_at' => null, 'expires_at' => now()->subSecond()]);
        $this->getJson('/api/me/unread-summary')->assertJsonPath('data.roles.therapist.total', 0);
    }
}
