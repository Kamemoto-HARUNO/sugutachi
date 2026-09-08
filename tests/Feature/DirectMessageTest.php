<?php

namespace Tests\Feature;

use App\Models\AccountBlock;
use App\Models\DirectMessage;
use App\Models\RoleRelationship;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\CreatesDirectMessageFixtures;
use Tests\TestCase;

class DirectMessageTest extends TestCase
{
    use CreatesDirectMessageFixtures;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['direct_messages.enabled' => true]);
        Storage::fake('local');
    }

    public function test_reverse_roles_have_distinct_inboxes_and_public_identities(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $first = $this->start($a, $b)->assertCreated()->json('data.thread.public_id');
        $second = $this->start($b, $a)->assertCreated()->json('data.thread.public_id');
        $this->assertNotSame($first, $second);
        $response = $this->asAccount($a)->getJson('/api/user/direct-messages')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.public_id', $first)->assertJsonPath('data.0.counterparty.display_name', 'Bキャスト');
        $this->assertStringNotContainsString($a->public_id, $response->getContent());
        $this->assertStringNotContainsString($b->public_id, $response->getContent());
        $this->assertStringNotContainsString('B利用者', $response->getContent());
        $this->getJson('/api/therapist/direct-messages')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.public_id', $second)->assertJsonPath('data.0.counterparty.display_name', 'B利用者');
        $this->getJson('/api/therapist/direct-messages/'.$first)->assertNotFound();
    }

    public function test_draft_does_not_create_conversation_and_sending_is_idempotent(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $this->asAccount($a)->getJson('/api/user/direct-messages/draft?therapist_id='.$b->therapistProfile->public_id)->assertOk()->assertJsonPath('data.thread_id', null);
        $this->assertDatabaseCount('direct_message_threads', 0);
        $id = $this->start($a, $b)->assertCreated()->json('data.message.public_id');
        $this->start($a, $b)->assertOk()->assertJsonPath('data.message.public_id', $id);
        $this->postJson('/api/user/direct-messages', ['target_therapist_profile_id' => $b->therapistProfile->public_id, 'body' => '変更', 'client_message_id' => 'first'])->assertConflict();
        $this->assertDatabaseCount('direct_messages', 1);
        $this->assertDatabaseCount('notifications', 1);
        $this->assertDatabaseCount('direct_message_deliveries', 2);
        $this->assertStringNotContainsString('事前に質問', DB::table('direct_messages')->value('body_encrypted'));
    }

    public function test_read_receipts_and_pause_are_limited_to_the_thread(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $one = $this->start($a, $b)->assertCreated()->json('data');
        $two = $this->start($b, $a)->assertCreated()->json('data');
        $this->asAccount($b)->postJson('/api/therapist/direct-messages/'.$one['thread']['public_id'].'/read', ['message_ids' => [$one['message']['public_id'], $two['message']['public_id']]])->assertOk();
        $this->assertNotNull(DirectMessage::where('public_id', $one['message']['public_id'])->first()->read_at);
        $this->assertNull(DirectMessage::where('public_id', $two['message']['public_id'])->first()->read_at);
        $this->patchJson('/api/therapist/direct-messages/'.$one['thread']['public_id'].'/preferences', ['paused' => true])->assertOk();
        $this->asAccount($a)->postJson('/api/user/direct-messages/'.$one['thread']['public_id'].'/messages', ['body' => '追記', 'client_message_id' => 'next'])->assertConflict();
    }

    public function test_new_role_block_preserves_reverse_direction_and_legacy_block_is_retained(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $this->start($a, $b)->assertCreated();
        RoleRelationship::query()->where('user_account_id', $a->id)->where('therapist_account_id', $b->id)->update(['therapist_blocked_at' => now()]);
        $this->start($a, $b, 'again')->assertConflict();
        $this->start($b, $a)->assertCreated();
        AccountBlock::create(['blocker_account_id' => $a->id, 'blocked_account_id' => $b->id]);
        $this->start($b, $a, 'blocked')->assertConflict();
        $this->assertDatabaseCount('account_blocks', 1);
    }

    public function test_acceptance_off_only_prevents_new_threads_and_unverified_user_can_consult(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $a->identityVerifications()->delete();
        $thread = $this->start($a, $b)->assertCreated()->json('data.thread.public_id');
        $b->therapistProfile->update(['consultation_enabled' => false]);
        $this->postJson('/api/user/direct-messages/'.$thread.'/messages', ['body' => '追記', 'client_message_id' => 'next'])->assertCreated();
        $c = $this->dual('C');
        $this->start($c, $b)->assertConflict();
        $this->assertDatabaseCount('direct_message_threads', 1);
    }

    public function test_images_are_private_and_can_be_deleted_by_sender_after_block(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $c = $this->dual('C');
        $response = $this->asAccount($a)->post('/api/user/direct-messages', ['target_therapist_profile_id' => $b->therapistProfile->public_id, 'image' => UploadedFile::fake()->image('private-original.jpg'), 'client_message_id' => 'image'], ['Accept' => 'application/json'])->assertCreated();
        $url = $response->json('data.message.image_url');
        $thread = $response->json('data.thread.public_id');
        $this->assertStringNotContainsString('private-original', $response->getContent());
        $this->get($url)->assertOk()->assertHeader('Content-Type', 'image/webp');
        $this->asAccount($c)->get($url)->assertNotFound();
        $recipientUrl = str_replace('/user/', '/therapist/', $url);
        $this->asAccount($b)->get($recipientUrl)->assertOk();
        $this->deleteJson($recipientUrl)->assertNotFound();
        RoleRelationship::query()->where('user_account_id', $a->id)->update(['therapist_blocked_at' => now()]);
        $this->asAccount($a)->deleteJson($url)->assertOk()->assertJsonPath('data.is_deleted', true);
        $this->get($url)->assertNotFound();
        $this->assertEmpty(Storage::disk('local')->allFiles('direct-messages'));
    }

    public function test_reply_limit_counts_images_and_human_reply_releases_limit(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $thread = $this->start($a, $b)->assertCreated()->json('data.thread.public_id');
        $this->start($a, $b, 'two')->assertCreated();
        $this->start($a, $b, 'three')->assertCreated();
        $this->start($a, $b, 'four')->assertStatus(429);
        $this->asAccount($b)->postJson('/api/therapist/direct-messages/'.$thread.'/messages', ['body' => 'ご質問をどうぞ', 'client_message_id' => 'reply'])->assertCreated();
        $this->start($a, $b, 'four')->assertCreated();
    }

    public function test_feature_off_keeps_existing_read_access_and_no_legacy_messages_created(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $thread = $this->start($a, $b)->assertCreated()->json('data.thread.public_id');
        config(['direct_messages.enabled' => false]);
        $this->start($a, $b, 'later')->assertConflict();
        $this->getJson('/api/user/direct-messages/'.$thread)->assertOk();
        $this->assertDatabaseCount('bookings', 0);
        $this->assertDatabaseCount('booking_messages', 0);
    }
}
