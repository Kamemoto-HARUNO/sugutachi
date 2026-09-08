<?php

namespace Tests\Feature;

use App\Models\DirectMessage;
use App\Models\DirectMessageThread;
use App\Models\PaymentIntent;
use App\Models\RoleRelationship;
use App\Services\DirectMessages\DirectMessageDelivery;
use App\Services\DirectMessages\DirectMessageRetention;
use App\Services\Payments\StripePaymentIntentGateway;
use Illuminate\Contracts\Foundation\MaintenanceMode;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class DirectMessageRecoveryTest extends TestCase
{
    use RefreshDatabase, \Tests\Concerns\CreatesDirectMessageFixtures;

    protected function setUp(): void
    {
        parent::setUp();
        config(['direct_messages.enabled' => true, 'direct_messages.delivery_enabled' => true]);
        Storage::fake('local');
        Mail::fake();
    }

    public function test_latest_privacy_journal_prevents_restored_contents_and_blocks_from_reappearing(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $this->start($a, $b)->assertCreated();
        $message = DirectMessage::first();
        $before = $message->getRawOriginal('body_encrypted');
        $relationship = RoleRelationship::first();
        $relationship->update(['therapist_blocked_at' => now()]);
        app(DirectMessageRetention::class)->erase($message);
        $path = sys_get_temp_dir().'/dm-recovery-'.bin2hex(random_bytes(8)).'.enc';
        try {
            $this->artisan('direct-messages:recovery', ['mode' => 'export', 'path' => $path])->assertSuccessful();
            $encrypted = file_get_contents($path);
            $this->assertStringNotContainsString($a->public_id, $encrypted);
            $journal = json_decode(Crypt::decryptString($encrypted), true);
            $this->assertArrayNotHasKey('messages', $journal);
            $this->assertSame($message->public_id, $journal['deletions'][0]['subject_public_id']);
            // Simulate restoring a database generation taken before deletion/block.
            DB::table('direct_messages')->where('id', $message->id)->update(['body_encrypted' => $before, 'deleted_at' => null]);
            DB::table('dm_deletions')->delete();
            $relationship->update(['therapist_blocked_at' => null]);
            $this->mock(MaintenanceMode::class)->shouldReceive('active')->andReturn(true);
            $this->artisan('direct-messages:recovery', ['mode' => 'apply', 'path' => $path])->assertSuccessful();
            $this->assertNull($message->fresh()->body_encrypted);
            $this->assertNotNull($message->fresh()->deleted_at);
            $this->assertNotNull($relationship->fresh()->therapist_blocked_at);
            $this->assertDatabaseCount('dm_deletions', 1);
            $this->assertDatabaseMissing('direct_message_deliveries', ['status' => 'pending']);
        } finally {
            @unlink($path);
        }
    }

    public function test_recovery_requires_maintenance_before_reading_a_journal(): void
    {
        $this->mock(MaintenanceMode::class)->shouldReceive('active')->andReturn(false);
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Enable maintenance mode');
        $this->artisan('direct-messages:recovery', ['mode' => 'apply', 'path' => '/private/tmp/nonexistent-dm-journal']);
    }

    public function test_grouped_email_failures_wait_before_retrying_and_stop_after_four_attempts(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        foreach (['first', 'second', 'third'] as $key) {
            $this->start($a, $b, $key)->assertCreated();
        }
        DB::table('direct_message_deliveries')->where('channel', 'push')->update(['status' => 'suppressed']);
        $this->travel(6)->minutes();
        Mail::shouldReceive('raw')->times(4)->andThrow(new \RuntimeException('Synthetic transport failure'));
        $delivery = app(DirectMessageDelivery::class);
        $delivery->run();
        $this->assertSame([1], DB::table('direct_message_deliveries')->where('channel', 'email')->pluck('attempts')->unique()->all());
        $delivery->run();
        $this->assertDatabaseMissing('direct_message_deliveries', ['attempts' => 2]);
        foreach ([1, 5, 30] as $minutes) {
            $this->travel($minutes)->minutes();
            $delivery->run();
        }
        $this->assertSame(3, DB::table('direct_message_deliveries')->where('status', 'failed')->where('attempts', 4)->count());
        $delivery->run();
    }

    public function test_revoked_recipient_role_stops_sending_without_merging_reverse_roles(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $this->start($a, $b)->assertCreated();
        $b->roleAssignments()->where('role', 'therapist')->update(['revoked_at' => now()]);
        $this->start($a, $b, 'again')->assertConflict();
        $this->start($b, $a)->assertCreated();
        $thread = DirectMessageThread::first();
        $this->asAccount($b)->getJson('/api/therapist/direct-messages/'.$thread->public_id)->assertForbidden();
    }

    public function test_all_stripe_capture_paths_refuse_a_booking_held_for_block_review(): void
    {
        $a = $this->dual('A');
        $b = $this->dual('B');
        $data = $this->start($a, $b)->assertCreated()->json('data');
        $booking = $this->booking($a, $b, 'in_progress');
        $payment = PaymentIntent::create(['booking_id' => $booking->id, 'payer_account_id' => $a->id, 'stripe_payment_intent_id' => 'pi_synthetic', 'status' => 'requires_capture', 'amount' => 12300]);
        $this->asAccount($b)->postJson('/api/therapist/relationships/'.$data['thread']['relationship_id'].'/block', ['confirm' => true])->assertOk();
        $this->expectException(HttpException::class);
        $this->expectExceptionMessage('ブロックに伴う精算を確認中');
        app(StripePaymentIntentGateway::class)->capture($payment);
    }
}
