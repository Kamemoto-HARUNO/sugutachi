<?php

namespace App\Services\Notifications;

use App\Models\AppNotification;
use Illuminate\Support\Facades\Mail;

class AppNotificationEmailDeliveryService
{
    public function deliverForNotification(AppNotification $notification): void
    {
        if ($notification->channel !== 'in_app' || $notification->status !== AppNotification::STATUS_SENT) {
            return;
        }

        $notification->loadMissing('account');

        $email = $notification->account?->email;

        if (blank($email)) {
            return;
        }

        $subject = filled($notification->title)
            ? $notification->title
            : sprintf('%s からのお知らせ', (string) config('app.name', 'Sugutachi'));

        $lines = array_values(array_filter([
            $notification->title,
            $notification->body,
            $this->targetUrlLine($notification),
        ], fn (?string $line): bool => filled($line)));

        $body = implode("\n\n", $lines);

        rescue(function () use ($body, $email, $subject): void {
            Mail::raw($body, function ($message) use ($email, $subject): void {
                $message->to($email)->subject($subject);
            });
        }, report: false);
    }

    private function targetUrlLine(AppNotification $notification): ?string
    {
        $targetPath = data_get($notification->data_json, 'target_path');

        if (! is_string($targetPath) || $targetPath === '') {
            return null;
        }

        return '確認する: '.rtrim((string) config('app.url', 'http://localhost'), '/').$targetPath;
    }
}
