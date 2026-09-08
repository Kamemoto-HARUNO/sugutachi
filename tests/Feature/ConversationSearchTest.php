<?php

namespace Tests\Feature;

use App\Models\DirectMessage;
use App\Models\DirectMessageThread;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Concerns\CreatesDirectMessageFixtures;
use Tests\TestCase;

class ConversationSearchTest extends TestCase
{
    use CreatesDirectMessageFixtures;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['direct_messages.enabled' => true]);
    }

    private function message(DirectMessageThread $thread, string $body, array $attributes = []): DirectMessage
    {
        return $thread->messages()->create([
            'public_id' => 'dmm_'.Str::ulid(), 'sender_role' => 'user',
            'client_message_id' => (string) Str::uuid(), 'content_hash' => hash('sha256', $body),
            'message_type' => 'text', 'body_encrypted' => $body,
            'sent_at' => now(), 'expires_at' => now()->addDays(90), ...$attributes,
        ]);
    }

    public function test_searches_old_encrypted_bodies_and_only_the_selected_role_and_public_name(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $c = $this->dual('C');
        $id = $this->start($a, $b)->assertCreated()->json('data.thread.public_id');
        $thread = DirectMessageThread::where('public_id', $id)->firstOrFail();
        $match = $this->message($thread, str_repeat('前文', 40).'当日の流れについて質問です');
        for ($i = 0; $i < 55; $i++) {
            $this->message($thread, 'その後の別の連絡です');
        }
        $reverse = $this->start($b, $a)->assertCreated()->json('data.thread.public_id');
        $this->message(DirectMessageThread::where('public_id', $reverse)->firstOrFail(), '逆の役割の秘密');
        $other = $this->start($b, $c)->assertCreated()->json('data.thread.public_id');
        $this->message(DirectMessageThread::where('public_id', $other)->firstOrFail(), '無関係な秘密');

        $response = $this->asAccount($a)->getJson('/api/user/direct-messages?q='.urlencode('当日の流れ'))
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.public_id', $id);
        $this->assertStringContainsString('当日の流れ', $response->json('data.0.search_preview'));
        $this->assertStringNotContainsString('当日の流れ', DB::table('direct_messages')->where('id', $match->id)->value('body_encrypted'));
        foreach (['逆の役割', '無関係', 'B利用者'] as $query) {
            $this->getJson('/api/user/direct-messages?q='.urlencode($query))->assertOk()->assertJsonCount(0, 'data');
        }
        $this->getJson('/api/user/direct-messages?q='.urlencode('Bキャスト'))->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/therapist/direct-messages?q='.urlencode('逆の役割'))->assertOk()->assertJsonPath('data.0.public_id', $reverse);
    }

    public function test_search_excludes_unavailable_content_and_respects_archive_and_unread_filters(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $id = $this->start($a, $b)->assertCreated()->json('data.thread.public_id');
        $thread = DirectMessageThread::where('public_id', $id)->firstOrFail();
        $this->message($thread, '削除された秘密', ['deleted_at' => now()]);
        $this->message($thread, '期限切れの秘密', ['expires_at' => now()->subSecond()]);
        $this->message($thread, '退会した人の秘密', ['sender_role' => 'therapist']);
        $b->forceFill(['status' => 'withdrawn', 'withdrawn_at' => now()->subDays(100)])->save();
        foreach (['削除された', '期限切れ', '退会した人'] as $query) {
            $this->asAccount($a)->getJson('/api/user/direct-messages?q='.urlencode($query))->assertOk()->assertJsonCount(0, 'data');
        }
        $this->message($thread, '検索できる本文');
        $thread->update(['user_archived' => true]);
        $this->getJson('/api/user/direct-messages?q='.urlencode('検索できる'))->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/user/direct-messages?filter=archived&q='.urlencode('検索できる'))->assertOk()->assertJsonCount(1, 'data');
        $thread->update(['user_archived' => false]);
        $this->getJson('/api/user/direct-messages?filter=unread&q='.urlencode('検索できる'))->assertOk()->assertJsonCount(0, 'data');
        $this->message($thread, '未読の返事', ['sender_role' => 'therapist']);
        $b->forceFill(['status' => 'active', 'withdrawn_at' => null])->save();
        $this->getJson('/api/user/direct-messages?filter=unread&q='.urlencode('検索できる'))->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_search_paginates_matches_across_the_entire_inbox(): void
    {
        config(['direct_messages.new_contacts_per_day' => 100, 'direct_messages.messages_per_minute' => 100]);
        $a = $this->dual('A');
        for ($i = 0; $i < 32; $i++) {
            $b = $this->dual('B'.$i);
            $id = $this->start($a, $b)->assertCreated()->json('data.thread.public_id');
            $this->message(DirectMessageThread::where('public_id', $id)->firstOrFail(), '検索語を含む連絡');
        }
        $first = $this->asAccount($a)->getJson('/api/user/direct-messages?q='.urlencode('検索語'))->assertOk()->assertJsonCount(30, 'data');
        $cursor = $first->json('meta.next_cursor');
        $this->assertNotNull($cursor);
        $second = $this->getJson('/api/user/direct-messages?q='.urlencode('検索語').'&cursor='.urlencode($cursor))->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('meta.next_cursor', null);
        $this->assertCount(32, array_unique([...array_column($first->json('data'), 'public_id'), ...array_column($second->json('data'), 'public_id')]));
    }

    public function test_search_treats_wildcards_literally_and_validates_length(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $id = $this->start($a, $b)->assertCreated()->json('data.thread.public_id');
        $this->message(DirectMessageThread::where('public_id', $id)->firstOrFail(), 'Test_100% の質問');
        $this->asAccount($a)->getJson('/api/user/direct-messages?q=test_100%25')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/user/direct-messages?q=Test%25')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/user/direct-messages?q='.str_repeat('a', 101))->assertUnprocessable();
        $this->getJson('/api/bookings?q='.str_repeat('a', 101))->assertUnprocessable();
    }

    public function test_booking_search_finds_older_body_without_revealing_closed_or_other_role_threads(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $c = $this->dual('C');
        $booking = $this->booking($a, $b);
        $reverse = $this->booking($b, $a);
        $other = $this->booking($b, $c);
        foreach ([$booking, $reverse, $other] as $item) {
            $item->messages()->create(['sender_account_id' => $item->user_account_id, 'message_type' => 'text', 'body_encrypted' => Crypt::encryptString('当日の持ち物の質問です'), 'sent_at' => now()]);
            $item->messages()->create(['sender_account_id' => $item->therapist_account_id, 'message_type' => 'text', 'body_encrypted' => Crypt::encryptString('後から送った別の本文'), 'sent_at' => now()]);
        }
        $this->asAccount($a)->getJson('/api/bookings?role=user&q='.urlencode('持ち物'))->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.public_id', $booking->public_id)->assertJsonPath('data.0.search_preview', '当日の持ち物の質問です');
        $this->getJson('/api/bookings?role=therapist&q='.urlencode('持ち物'))->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.public_id', $reverse->public_id);
        $this->getJson('/api/bookings?role=user&q='.urlencode('B利用者'))->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/bookings?role=user&q='.urlencode('Bキャスト'))->assertOk()->assertJsonCount(1, 'data');
        $booking->update(['messages_closed_at' => now(), 'messages_closed_by_account_id' => $b->id]);
        $this->getJson('/api/bookings?role=user&q='.urlencode('持ち物'))->assertOk()->assertJsonCount(0, 'data');
        $this->asAccount($b)->getJson('/api/bookings?role=therapist&q='.urlencode('持ち物'))->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.public_id', $booking->public_id);
    }
}
