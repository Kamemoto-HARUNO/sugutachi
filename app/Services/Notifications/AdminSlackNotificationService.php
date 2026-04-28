<?php

namespace App\Services\Notifications;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class AdminSlackNotificationService
{
    public function send(string $type, string $title, string $body, array $data = []): void
    {
        $webhookUrl = trim((string) config('services.admin_notifications.slack_webhook_url'));

        if ($webhookUrl === '') {
            return;
        }

        $targetPath = data_get($data, 'target_path');
        $targetUrl = is_string($targetPath) && $targetPath !== ''
            ? rtrim((string) config('app.url'), '/') . $targetPath
            : null;

        $payload = [
            'text' => sprintf('[%s] %s', $this->environmentLabel(), $title),
            'blocks' => array_values(array_filter([
                [
                    'type' => 'header',
                    'text' => [
                        'type' => 'plain_text',
                        'text' => sprintf('[%s] %s', $this->environmentLabel(), $title),
                        'emoji' => true,
                    ],
                ],
                [
                    'type' => 'section',
                    'text' => [
                        'type' => 'mrkdwn',
                        'text' => $body,
                    ],
                    'fields' => array_values(array_filter([
                        [
                            'type' => 'mrkdwn',
                            'text' => "*通知種別*\n{$type}",
                        ],
                        [
                            'type' => 'mrkdwn',
                            'text' => "*対象*\n運営",
                        ],
                        $targetUrl ? [
                            'type' => 'mrkdwn',
                            'text' => "*確認先*\n<{$targetUrl}|管理画面を開く>",
                        ] : null,
                    ])),
                ],
                $targetUrl ? [
                    'type' => 'actions',
                    'elements' => [
                        [
                            'type' => 'button',
                            'text' => [
                                'type' => 'plain_text',
                                'text' => '管理画面を開く',
                                'emoji' => true,
                            ],
                            'url' => $targetUrl,
                        ],
                    ],
                ] : null,
            ])),
        ];

        try {
            $response = Http::asJson()
                ->timeout(5)
                ->post($webhookUrl, $payload);

            if ($response->failed()) {
                Log::warning('Admin Slack webhook notification failed.', [
                    'type' => $type,
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
            }
        } catch (Throwable $exception) {
            Log::warning('Admin Slack webhook notification threw an exception.', [
                'type' => $type,
                'message' => $exception->getMessage(),
            ]);
        }
    }

    private function environmentLabel(): string
    {
        return match (app()->environment()) {
            'production' => '本番',
            'staging' => '開発',
            default => 'ローカル',
        };
    }
}
