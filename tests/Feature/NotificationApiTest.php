<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\AppNotification;
use App\Models\PushSubscription;
use App\Services\Notifications\WebPushDeliveryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
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
            ->assertJsonPath('data.0.data.booking_id', 'book_notify')
            ->assertJsonPath('data.0.target_role', 'therapist')
            ->assertJsonPath('data.0.is_read', false)
            ->assertJsonPath('meta.unread_count', 1);

        $this->withToken($token)
            ->postJson("/api/notifications/{$notification->id}/read")
            ->assertOk()
            ->assertJsonPath('status', 'read')
            ->assertJsonPath('is_read', true);

        $this->assertNotNull($notification->refresh()->read_at);
        $this->assertSame('read', $notification->refresh()->status);
    }

    public function test_account_can_filter_notifications_and_get_unread_count(): void
    {
        $account = Account::factory()->create(['public_id' => 'acc_notify_filter']);
        $token = $account->createToken('api')->plainTextToken;

        AppNotification::create([
            'account_id' => $account->id,
            'notification_type' => 'booking_requested',
            'channel' => 'in_app',
            'title' => 'Requested',
            'body' => 'New request arrived.',
            'status' => 'sent',
            'sent_at' => now()->subMinutes(3),
        ]);

        $target = AppNotification::create([
            'account_id' => $account->id,
            'notification_type' => 'booking_canceled',
            'channel' => 'in_app',
            'title' => 'Canceled',
            'body' => 'A booking was canceled.',
            'status' => 'sent',
            'sent_at' => now()->subMinutes(2),
        ]);

        AppNotification::create([
            'account_id' => $account->id,
            'notification_type' => 'booking_refunded',
            'channel' => 'in_app',
            'title' => 'Refunded',
            'body' => 'A refund was processed.',
            'status' => 'read',
            'sent_at' => now()->subMinute(),
            'read_at' => now()->subMinute(),
        ]);

        $this->withToken($token)
            ->getJson('/api/notifications?notification_type=booking_canceled&status=sent&read_status=unread&limit=10')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $target->id)
            ->assertJsonPath('data.0.notification_type', 'booking_canceled')
            ->assertJsonPath('meta.unread_count', 2)
            ->assertJsonPath('meta.limit', 10)
            ->assertJsonPath('meta.filters.notification_type', 'booking_canceled')
            ->assertJsonPath('meta.filters.status', 'sent')
            ->assertJsonPath('meta.filters.read_status', 'unread');
    }

    public function test_account_can_mark_all_notifications_as_read(): void
    {
        $account = Account::factory()->create(['public_id' => 'acc_notify_all_read']);
        $token = $account->createToken('api')->plainTextToken;

        AppNotification::create([
            'account_id' => $account->id,
            'notification_type' => 'booking_requested',
            'channel' => 'in_app',
            'title' => 'Requested',
            'body' => 'New request arrived.',
            'status' => 'sent',
            'sent_at' => now()->subMinutes(2),
        ]);

        AppNotification::create([
            'account_id' => $account->id,
            'notification_type' => 'booking_refunded',
            'channel' => 'in_app',
            'title' => 'Refunded',
            'body' => 'A refund was processed.',
            'status' => 'sent',
            'sent_at' => now()->subMinute(),
        ]);

        $this->withToken($token)
            ->postJson('/api/notifications/read-all')
            ->assertOk()
            ->assertJsonPath('data.updated_count', 2)
            ->assertJsonPath('data.unread_count', 0);

        $this->assertSame(2, AppNotification::query()
            ->where('account_id', $account->id)
            ->whereNotNull('read_at')
            ->count());
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
            ->deleteJson('/api/push-subscriptions/current', [
                'endpoint' => 'https://push.example.test/subscription/123',
            ])
            ->assertNoContent();

        $this->assertSame('denied', PushSubscription::query()->findOrFail($subscriptionId)->permission_status);
        $this->assertNotNull(PushSubscription::query()->findOrFail($subscriptionId)->revoked_at);

        $this->withToken($token)
            ->deleteJson("/api/push-subscriptions/{$subscriptionId}")
            ->assertNoContent();

        $this->assertSame('denied', PushSubscription::query()->findOrFail($subscriptionId)->permission_status);
        $this->assertNotNull(PushSubscription::query()->findOrFail($subscriptionId)->revoked_at);
    }

    public function test_creating_notification_triggers_web_push_delivery_service(): void
    {
        $account = Account::factory()->create(['public_id' => 'acc_push_delivery']);

        $mock = Mockery::mock(WebPushDeliveryService::class);
        $mock->shouldReceive('deliverForNotification')
            ->once()
            ->withArgs(function (AppNotification $notification) use ($account): bool {
                return $notification->account_id === $account->id
                    && $notification->notification_type === 'booking_requested';
            });

        $this->app->instance(WebPushDeliveryService::class, $mock);

        AppNotification::create([
            'account_id' => $account->id,
            'notification_type' => 'booking_requested',
            'channel' => 'in_app',
            'title' => '新しい予約があります',
            'body' => '内容を確認してください。',
            'status' => AppNotification::STATUS_SENT,
            'sent_at' => now(),
        ]);
    }
}
