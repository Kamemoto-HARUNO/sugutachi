<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\AppNotification;
use App\Models\ContactInquiry;
use App\Models\PushSubscription;
use App\Services\Notifications\AdminNotificationService;
use App\Services\Notifications\WebPushDeliveryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
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

        $account->roleAssignments()->create(['role' => 'therapist', 'status' => 'active']);
        $token = $account->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/notifications?role=therapist')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $notification->id)
            ->assertJsonPath('data.0.data.booking_id', 'book_notify')
            ->assertJsonPath('data.0.target_role', 'therapist')
            ->assertJsonPath('data.0.is_read', false)
            ->assertJsonPath('meta.unread_count', 1);

        $this->withToken($token)
            ->postJson("/api/notifications/{$notification->id}/read?role=therapist")
            ->assertOk()
            ->assertJsonPath('status', 'read')
            ->assertJsonPath('is_read', true);

        $this->assertNotNull($notification->refresh()->read_at);
        $this->assertSame('read', $notification->refresh()->status);
    }

    public function test_account_can_filter_notifications_and_get_unread_count(): void
    {
        $account = Account::factory()->create(['public_id' => 'acc_notify_filter']);
        $account->roleAssignments()->create(['role' => 'therapist', 'status' => 'active']);
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
            'data_json' => ['target_role' => 'therapist'],
            'channel' => 'in_app',
            'title' => 'Canceled',
            'body' => 'A booking was canceled.',
            'status' => 'sent',
            'sent_at' => now()->subMinutes(2),
        ]);

        AppNotification::create([
            'account_id' => $account->id,
            'notification_type' => 'booking_refunded',
            'data_json' => ['target_role' => 'therapist'],
            'channel' => 'in_app',
            'title' => 'Refunded',
            'body' => 'A refund was processed.',
            'status' => 'read',
            'sent_at' => now()->subMinute(),
            'read_at' => now()->subMinute(),
        ]);

        $this->withToken($token)
            ->getJson('/api/notifications?role=therapist&notification_type=booking_canceled&status=sent&read_status=unread&limit=10')
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
        $account->roleAssignments()->create(['role' => 'therapist', 'status' => 'active']);
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
            'data_json' => ['target_role' => 'therapist'],
            'channel' => 'in_app',
            'title' => 'Refunded',
            'body' => 'A refund was processed.',
            'status' => 'sent',
            'sent_at' => now()->subMinute(),
        ]);

        $this->withToken($token)
            ->postJson('/api/notifications/read-all?role=therapist')
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

    public function test_creating_notification_triggers_web_push_and_email_delivery_services(): void
    {
        $account = Account::factory()->create(['public_id' => 'acc_push_delivery']);
        config()->set('mail.from.address', 'noreply@example.test');
        config()->set('mail.from.name', 'すぐタチ');
        config()->set('service_meta.support_email', 'support@example.test');

        $mock = Mockery::mock(WebPushDeliveryService::class);
        $mock->shouldReceive('deliverForNotification')
            ->once()
            ->withArgs(function (AppNotification $notification) use ($account): bool {
                return $notification->account_id === $account->id
                    && $notification->notification_type === 'booking_requested';
            });

        $this->app->instance(WebPushDeliveryService::class, $mock);
        Mail::shouldReceive('raw')
            ->once()
            ->withArgs(function (string $body, $callback) use ($account): bool {
                $message = new class
                {
                    public ?string $to = null;

                    public ?string $subject = null;

                    public ?string $fromAddress = null;

                    public ?string $fromName = null;

                    public ?string $replyToAddress = null;

                    public ?string $replyToName = null;

                    public function to(string $value): self
                    {
                        $this->to = $value;

                        return $this;
                    }

                    public function subject(string $value): self
                    {
                        $this->subject = $value;

                        return $this;
                    }

                    public function from(string $address, ?string $name = null): self
                    {
                        $this->fromAddress = $address;
                        $this->fromName = $name;

                        return $this;
                    }

                    public function replyTo(string $address, ?string $name = null): self
                    {
                        $this->replyToAddress = $address;
                        $this->replyToName = $name;

                        return $this;
                    }
                };

                $callback($message);

                return str_contains($body, '新しい予約があります')
                    && str_contains($body, '内容を確認してください。')
                    && str_contains($body, 'このメールはアプリ内通知にあわせて自動送信しています。')
                    && str_contains($body, 'お問い合わせ: support@example.test')
                    && $message->to === $account->email
                    && $message->subject === '[すぐタチ] 新しい予約があります'
                    && $message->fromAddress === 'noreply@example.test'
                    && $message->fromName === 'すぐタチ'
                    && $message->replyToAddress === 'support@example.test'
                    && $message->replyToName === 'すぐタチ'
                    && is_callable($callback);
            });

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

    public function test_email_delivery_failures_are_logged_without_breaking_notification_creation(): void
    {
        $account = Account::factory()->create(['public_id' => 'acc_push_delivery_failure']);

        $mock = Mockery::mock(WebPushDeliveryService::class);
        $mock->shouldReceive('deliverForNotification')->once();

        $this->app->instance(WebPushDeliveryService::class, $mock);

        Mail::shouldReceive('raw')
            ->once()
            ->andThrow(new \RuntimeException('SMTP auth failed'));

        Log::shouldReceive('warning')
            ->once()
            ->withArgs(function (string $message, array $context) use ($account): bool {
                return $message === 'App notification email delivery failed.'
                    && $context['account_id'] === $account->id
                    && $context['notification_type'] === 'booking_requested'
                    && $context['recipient_email'] === $account->email
                    && str_contains($context['message'] ?? '', 'SMTP auth failed');
            });

        AppNotification::create([
            'account_id' => $account->id,
            'notification_type' => 'booking_requested',
            'channel' => 'in_app',
            'title' => '新しい予約があります',
            'body' => '内容を確認してください。',
            'status' => AppNotification::STATUS_SENT,
            'sent_at' => now(),
        ]);

        $this->assertDatabaseHas('notifications', [
            'account_id' => $account->id,
            'notification_type' => 'booking_requested',
            'status' => AppNotification::STATUS_SENT,
        ]);
    }

    public function test_mail_config_normalizes_legacy_tls_and_ssl_schemes(): void
    {
        $originalEnv = [
            'MAIL_SCHEME' => env('MAIL_SCHEME'),
        ];

        try {
            putenv('MAIL_SCHEME=tls');
            $_ENV['MAIL_SCHEME'] = 'tls';
            $_SERVER['MAIL_SCHEME'] = 'tls';

            $tlsConfig = require base_path('config/mail.php');

            putenv('MAIL_SCHEME=ssl');
            $_ENV['MAIL_SCHEME'] = 'ssl';
            $_SERVER['MAIL_SCHEME'] = 'ssl';

            $sslConfig = require base_path('config/mail.php');

            putenv('MAIL_SCHEME=');
            $_ENV['MAIL_SCHEME'] = '';
            $_SERVER['MAIL_SCHEME'] = '';

            $emptyConfig = require base_path('config/mail.php');
        } finally {
            if ($originalEnv['MAIL_SCHEME'] === null) {
                putenv('MAIL_SCHEME');
                unset($_ENV['MAIL_SCHEME'], $_SERVER['MAIL_SCHEME']);
            } else {
                putenv('MAIL_SCHEME='.$originalEnv['MAIL_SCHEME']);
                $_ENV['MAIL_SCHEME'] = $originalEnv['MAIL_SCHEME'];
                $_SERVER['MAIL_SCHEME'] = $originalEnv['MAIL_SCHEME'];
            }
        }

        $this->assertSame('smtp', $tlsConfig['mailers']['smtp']['scheme']);
        $this->assertSame('smtps', $sslConfig['mailers']['smtp']['scheme']);
        $this->assertNull($emptyConfig['mailers']['smtp']['scheme']);
    }

    public function test_admin_notification_service_sends_slack_webhook_when_configured(): void
    {
        config()->set('services.admin_notifications.slack_webhook_url', 'https://hooks.slack.com/services/test/admin/webhook');
        config()->set('app.url', 'https://dev.sugutachi.com');
        Mail::shouldReceive('raw')
            ->once()
            ->withArgs(function (string $body, $callback): bool {
                return str_contains($body, '新しいお問い合わせがあります')
                    && str_contains($body, '/admin/contact-inquiries/cnt_slack_notify')
                    && is_callable($callback);
            });

        Http::fake([
            'https://hooks.slack.com/*' => Http::response('ok', 200),
        ]);

        $admin = Account::factory()->create(['public_id' => 'acc_admin_notify_slack']);
        $admin->roleAssignments()->create([
            'role' => 'admin',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        $inquiry = ContactInquiry::create([
            'public_id' => 'cnt_slack_notify',
            'name' => '問い合わせ太郎',
            'email' => 'contact@example.test',
            'category' => 'other',
            'message' => 'テスト問い合わせです。',
            'status' => ContactInquiry::STATUS_PENDING,
            'source' => ContactInquiry::SOURCE_GUEST,
        ]);

        app(AdminNotificationService::class)->notifyContactInquiryReceived($inquiry);

        $this->assertDatabaseHas('notifications', [
            'account_id' => $admin->id,
            'notification_type' => 'contact_inquiry_received',
            'channel' => 'in_app',
            'status' => AppNotification::STATUS_SENT,
        ]);

        Http::assertSent(function (Request $request): bool {
            $payload = $request->data();

            return $request->url() === 'https://hooks.slack.com/services/test/admin/webhook'
                && str_contains((string) data_get($payload, 'text'), '新しいお問い合わせがあります')
                && str_contains((string) data_get($payload, 'text'), 'ローカル')
                && str_contains((string) data_get($payload, 'blocks.1.fields.2.text'), '/admin/contact-inquiries/cnt_slack_notify');
        });
    }
}
