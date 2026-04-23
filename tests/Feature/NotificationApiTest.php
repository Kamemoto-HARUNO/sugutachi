<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\AppNotification;
use App\Models\PushSubscription;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotificationApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_account_can_list_and_read_own_notifications(): void
    {
        $account = Account::factory()->create(['public_id' => 'acc_notify']);
        $other = Account::factory()->create(['public_id' => 'acc_notify_other']);

        $notification = AppNotification::create([
            'account_id' => $account->id,
            'notification_type' => 'booking_requested',
            'channel' => 'in_app',
            'title' => 'New booking',
            'body' => 'A booking was requested.',
            'data_json' => ['booking_id' => 'book_notify'],
            'status' => 'sent',
            'sent_at' => now(),
        ]);
        AppNotification::create([
            'account_id' => $other->id,
            'notification_type' => 'booking_requested',
            'channel' => 'in_app',
            'title' => 'Other booking',
            'status' => 'sent',
            'sent_at' => now(),
        ]);

        $token = $account->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $notification->id)
            ->assertJsonPath('data.0.data.booking_id', 'book_notify');

        $this->withToken($token)
            ->postJson("/api/notifications/{$notification->id}/read")
            ->assertOk();

        $this->assertNotNull($notification->refresh()->read_at);
    }

    public function test_account_can_create_update_and_revoke_push_subscription(): void
    {
        $account = Account::factory()->create(['public_id' => 'acc_push']);
        $token = $account->createToken('api')->plainTextToken;

        $subscriptionId = $this->withToken($token)
            ->postJson('/api/push-subscriptions', [
                'endpoint' => 'https://push.example.test/subscription/123',
                'keys' => [
                    'p256dh' => 'test-p256dh',
                    'auth' => 'test-auth',
                ],
                'permission_status' => 'granted',
            ])
            ->assertCreated()
            ->assertJsonPath('data.permission_status', 'granted')
            ->assertJsonPath('data.revoked_at', null)
            ->json('data.id');

        $this->assertDatabaseHas('push_subscriptions', [
            'id' => $subscriptionId,
            'account_id' => $account->id,
            'endpoint_hash' => hash('sha256', 'https://push.example.test/subscription/123'),
            'permission_status' => 'granted',
        ]);

        $this->withToken($token)
            ->postJson('/api/push-subscriptions', [
                'endpoint' => 'https://push.example.test/subscription/123',
                'keys' => [
                    'p256dh' => 'test-p256dh-updated',
                    'auth' => 'test-auth-updated',
                ],
                'permission_status' => 'default',
            ])
            ->assertOk()
            ->assertJsonPath('data.id', $subscriptionId)
            ->assertJsonPath('data.permission_status', 'default');

        $this->withToken($token)
            ->deleteJson("/api/push-subscriptions/{$subscriptionId}")
            ->assertNoContent();

        $this->assertSame('denied', PushSubscription::query()->findOrFail($subscriptionId)->permission_status);
        $this->assertNotNull(PushSubscription::query()->findOrFail($subscriptionId)->revoked_at);
    }
}
