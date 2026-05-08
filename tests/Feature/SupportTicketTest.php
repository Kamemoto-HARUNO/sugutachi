<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\AppNotification;
use App\Models\SupportTicket;
use App\Models\SupportTicketMessage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SupportTicketTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_and_admin_can_chat_on_support_ticket_with_read_tracking(): void
    {
        Mail::fake();

        [$admin, $user] = $this->createAccounts();

        Sanctum::actingAs($user);
        $ticketId = $this->postJson('/api/support/tickets', [
                'title' => '予約について相談したい',
                'category' => 'booking',
                'message' => '予約時間について確認したいです。',
            ])
            ->assertOk()
            ->assertJsonPath('data.title', '予約について相談したい')
            ->assertJsonPath('data.status', SupportTicket::STATUS_OPEN)
            ->assertJsonPath('data.messages.0.body', '予約時間について確認したいです。')
            ->json('data.public_id');

        $ticket = SupportTicket::query()->where('public_id', $ticketId)->firstOrFail();
        $firstMessage = $ticket->messages()->firstOrFail();
        $this->assertSame($user->id, $ticket->account_id);
        $this->assertSame('user', $ticket->requester_role);
        $this->assertNotNull($firstMessage->read_by_user_at);
        $this->assertNull($firstMessage->read_by_admin_at);
        $this->assertDatabaseHas('notifications', [
            'account_id' => $admin->id,
            'notification_type' => 'support_ticket_created',
            'status' => AppNotification::STATUS_SENT,
        ]);

        Sanctum::actingAs($admin);
        $this->getJson('/api/admin/support-tickets?read_status=unread')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $ticketId)
            ->assertJsonPath('data.0.unread_count', 1);

        $this->getJson("/api/admin/support-tickets/{$ticketId}")
            ->assertOk()
            ->assertJsonPath('data.messages.0.body', '予約時間について確認したいです。')
            ->assertJsonPath('data.messages.0.sender.public_id', $user->public_id);

        $this->assertNotNull($firstMessage->refresh()->read_by_admin_at);

        $replyId = $this->postJson("/api/admin/support-tickets/{$ticketId}/messages", [
                'body' => '運営で確認します。',
            ])
            ->assertCreated()
            ->assertJsonPath('data.body', '運営で確認します。')
            ->assertJsonPath('data.sender.public_id', $admin->public_id)
            ->json('data.id');

        $reply = SupportTicketMessage::query()->findOrFail($replyId);
        $this->assertNotNull($reply->read_by_admin_at);
        $this->assertNull($reply->read_by_user_at);
        $this->assertDatabaseHas('notifications', [
            'account_id' => $user->id,
            'notification_type' => 'support_ticket_message_received',
            'status' => AppNotification::STATUS_SENT,
        ]);

        Sanctum::actingAs($user);
        $this->getJson("/api/support/tickets/{$ticketId}")
            ->assertOk()
            ->assertJsonPath('data.messages.1.sender.display_name', '運営')
            ->assertJsonPath('data.messages.1.sender.public_id', null);

        $this->assertNotNull($reply->refresh()->read_by_user_at);

        Sanctum::actingAs($admin);
        $this->postJson("/api/admin/support-tickets/{$ticketId}/complete")
            ->assertOk()
            ->assertJsonPath('data.status', SupportTicket::STATUS_COMPLETED)
            ->assertJsonPath('data.can_send', false);

        Sanctum::actingAs($user);
        $this->postJson("/api/support/tickets/{$ticketId}/messages", [
                'body' => '追加で確認したいです。',
            ])
            ->assertStatus(409);
    }

    public function test_admin_can_create_support_ticket_for_therapist(): void
    {
        Mail::fake();

        [$admin, , $therapist] = $this->createAccounts();

        Sanctum::actingAs($admin);
        $ticketId = $this->postJson('/api/admin/support-tickets', [
                'account_id' => $therapist->public_id,
                'requester_role' => 'therapist',
                'title' => 'プロフィール審査について',
                'category' => 'account',
                'message' => 'プロフィールの確認事項があります。',
            ])
            ->assertOk()
            ->assertJsonPath('data.origin', SupportTicket::ORIGIN_ADMIN)
            ->assertJsonPath('data.requester_role', 'therapist')
            ->assertJsonPath('data.messages.0.sender.public_id', $admin->public_id)
            ->json('data.public_id');

        $this->assertDatabaseHas('notifications', [
            'account_id' => $therapist->id,
            'notification_type' => 'support_ticket_created',
            'status' => AppNotification::STATUS_SENT,
        ]);

        Sanctum::actingAs($therapist);
        $this->getJson("/api/support/tickets/{$ticketId}")
            ->assertOk()
            ->assertJsonPath('data.messages.0.sender.display_name', '運営')
            ->assertJsonPath('data.messages.0.sender.public_id', null);
    }

    public function test_support_ticket_messages_can_include_images(): void
    {
        Mail::fake();
        Storage::fake('local');

        [$admin, $user] = $this->createAccounts();

        Sanctum::actingAs($user);
        $ticketId = $this->postJson('/api/support/tickets', [
                'title' => '画像で相談したい',
                'category' => 'service',
                'message' => '画像を送ります。',
            ])
            ->assertOk()
            ->json('data.public_id');

        $messageId = $this->post("/api/support/tickets/{$ticketId}/messages", [
                'image' => UploadedFile::fake()->image('support.jpg', 640, 480),
            ])
            ->assertCreated()
            ->assertJsonPath('data.message_type', SupportTicketMessage::TYPE_IMAGE)
            ->assertJsonPath('data.attachment_original_name', 'support.jpg')
            ->json('data.id');

        $message = SupportTicketMessage::query()->findOrFail($messageId);
        $this->assertNotNull($message->attachment_storage_key_encrypted);

        $userAttachmentUrl = $this->getJson("/api/support/tickets/{$ticketId}")
            ->assertOk()
            ->assertJsonPath('data.messages.1.message_type', SupportTicketMessage::TYPE_IMAGE)
            ->assertJsonPath('data.messages.1.attachment_original_name', 'support.jpg')
            ->json('data.messages.1.attachment_url');
        $this->assertNotEmpty($userAttachmentUrl);

        Sanctum::actingAs($admin);
        $adminAttachmentUrl = $this->getJson("/api/admin/support-tickets/{$ticketId}")
            ->assertOk()
            ->assertJsonPath('data.messages.1.message_type', SupportTicketMessage::TYPE_IMAGE)
            ->assertJsonPath('data.messages.1.attachment_original_name', 'support.jpg')
            ->json('data.messages.1.attachment_url');
        $this->assertNotEmpty($adminAttachmentUrl);

        $this->postJson("/api/admin/support-tickets/{$ticketId}/messages", [
                'body' => '画像を確認しました。',
            ])
            ->assertCreated();
    }

    private function createAccounts(): array
    {
        $admin = Account::factory()->create(['last_active_role' => 'admin']);
        $admin->roleAssignments()->create([
            'role' => 'admin',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        $user = Account::factory()->create(['last_active_role' => 'user']);
        $user->roleAssignments()->create([
            'role' => 'user',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        $therapist = Account::factory()->create(['last_active_role' => 'therapist']);
        $therapist->roleAssignments()->create([
            'role' => 'therapist',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        return [$admin, $user, $therapist];
    }
}
