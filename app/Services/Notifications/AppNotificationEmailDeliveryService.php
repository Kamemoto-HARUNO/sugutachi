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

        if ($this->isFavoriteUserNotification($notification)) {
            if (! $notification->account) {
                return;
            }

            $notification->account->loadMissing('userProfile');

            if (! (bool) ($notification->account->userProfile?->favorite_email_notifications_enabled ?? true)) {
                return;
            }
        }

        $serviceName = (string) config('service_meta.name', config('app.name', 'Sugutachi'));
        $supportEmail = trim((string) config('service_meta.support_email', ''));
        $fromAddress = trim((string) config('mail.from.address', ''));
        $fromName = (string) config('mail.from.name', $serviceName);
        $subjectBase = filled($notification->title)
            ? $notification->title
            : sprintf('%s からのお知らせ', $serviceName);
        $subject = sprintf('[%s] %s', $serviceName, $subjectBase);

        $lines = array_values(array_filter([
            $notification->title,
            $notification->body,
            $this->targetUrlLine($notification),
            'このメールはアプリ内通知にあわせて自動送信しています。',
            '本メールは送信専用です。',
            $supportEmail !== '' ? 'お問い合わせ: '.$supportEmail : null,
        ], fn (?string $line): bool => filled($line)));

        $body = implode("\n\n", $lines);

        try {
            Mail::raw($body, function ($message) use ($email, $subject, $fromAddress, $fromName, $supportEmail): void {
                $message->to($email)->subject($subject);

                if ($fromAddress !== '') {
                    $message->from($fromAddress, $fromName);
                }

                if ($supportEmail !== '') {
                    $message->replyTo($supportEmail, $fromName);
                }
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

    private function isFavoriteUserNotification(AppNotification $notification): bool
    {
        return in_array($notification->notification_type, [
            'favorite_therapist_online',
            'favorite_therapist_availability',
        ], true);
    }
}
