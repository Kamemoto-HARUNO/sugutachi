<?php

namespace App\Services\Notifications;

use App\Models\AppNotification;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

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

        try {
            Mail::raw($body, function ($message) use ($email, $subject): void {
                $message->to($email)->subject($subject);
            });
        } catch (Throwable $exception) {
            Log::warning('App notification email delivery failed.', [
                'notification_id' => $notification->id,
                'account_id' => $notification->account_id,
                'notification_type' => $notification->notification_type,
                'recipient_email' => $email,
                'message' => $exception->getMessage(),
            ]);
        }
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
