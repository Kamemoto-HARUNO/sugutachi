<?php

namespace App\Services\Notifications;

use App\Models\AppNotification;
use App\Models\PushSubscription;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;
use Throwable;

class WebPushDeliveryService
{
    public function deliverForNotification(AppNotification $notification): void
    {
        if (! $this->isConfigured()) {
            return;
        }

        if ($notification->channel !== 'in_app' || $notification->status !== AppNotification::STATUS_SENT) {
            return;
        }

        $subscriptions = PushSubscription::query()
            ->where('account_id', $notification->account_id)
            ->where('permission_status', 'granted')
            ->whereNull('revoked_at')
            ->get();

        if ($subscriptions->isEmpty()) {
            return;
        }

        $payload = json_encode($this->buildPayload($notification), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        if ($payload === false) {
            return;
        }

        $webPush = new WebPush([
            'VAPID' => [
                'subject' => (string) config('services.web_push.subject'),
                'publicKey' => (string) config('services.web_push.public_key'),
                'privateKey' => (string) config('services.web_push.private_key'),
            ],
        ], [
            'TTL' => 300,
            'urgency' => 'normal',
            'contentType' => 'application/json',
        ]);
        $webPush->setReuseVAPIDHeaders(true);

        $endpointHashMap = [];

        foreach ($subscriptions as $subscription) {
            try {
                $endpoint = Crypt::decryptString($subscription->endpoint_encrypted);
                $p256dh = Crypt::decryptString($subscription->p256dh_encrypted);
                $auth = Crypt::decryptString($subscription->auth_encrypted);
            } catch (Throwable $exception) {
                Log::warning('Failed to decrypt a push subscription.', [
                    'subscription_id' => $subscription->id,
                    'account_id' => $subscription->account_id,
                    'exception' => $exception->getMessage(),
                ]);
                continue;
            }

            $endpointHashMap[hash('sha256', $endpoint)] = $subscription->id;

            $webPush->queueNotification(
                Subscription::create([
                    'endpoint' => $endpoint,
                    'keys' => [
                        'p256dh' => $p256dh,
                        'auth' => $auth,
                    ],
                ]),
                $payload,
                [
                    'topic' => $this->topicForNotification($notification),
                ],
            );
        }

        foreach ($webPush->flush() as $report) {
            $endpointHash = hash('sha256', $report->getEndpoint());
            $subscriptionId = $endpointHashMap[$endpointHash] ?? null;

            if (! $subscriptionId) {
                continue;
            }

            /** @var PushSubscription|null $subscription */
            $subscription = $subscriptions->firstWhere('id', $subscriptionId);

            if (! $subscription) {
                continue;
            }

            if ($report->isSuccess()) {
                $subscription->forceFill([
                    'last_used_at' => now(),
                ])->save();
                continue;
            }

            Log::warning('Web push delivery failed.', [
                'notification_id' => $notification->id,
                'subscription_id' => $subscription->id,
                'account_id' => $notification->account_id,
                'reason' => $report->getReason(),
            ]);

            if ($report->isSubscriptionExpired()) {
                $subscription->forceFill([
                    'permission_status' => 'denied',
                    'revoked_at' => now(),
                ])->save();
            }
        }
    }

    private function buildPayload(AppNotification $notification): array
    {
        $data = $notification->data_json ?? [];

        return [
            'title' => $notification->title,
            'body' => $notification->body ?: '新しいお知らせがあります。',
            'icon' => '/apple-touch-icon.png',
            'badge' => '/apple-touch-icon.png',
            'tag' => sprintf('notification-%d', $notification->id),
            'renotify' => true,
            'data' => [
                'notification_id' => $notification->id,
                'notification_type' => $notification->notification_type,
                'target_path' => data_get($data, 'target_path', '/notifications'),
                'target_role' => data_get($data, 'target_role'),
                'sent_at' => $notification->sent_at?->toIso8601String(),
            ],
        ];
    }

    private function topicForNotification(AppNotification $notification): string
    {
        return substr(sprintf('n-%d', $notification->id), 0, 32);
    }

    private function isConfigured(): bool
    {
        return filled(config('services.web_push.public_key'))
            && filled(config('services.web_push.private_key'))
            && filled(config('services.web_push.subject'));
    }
}
