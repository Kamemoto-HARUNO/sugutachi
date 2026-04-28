<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class AccountPasswordResetNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly string $token,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $email = urlencode((string) $notifiable->getEmailForPasswordReset());

        return (new MailMessage)
            ->subject('パスワード再設定のご案内')
            ->greeting('パスワード再設定のご案内です')
            ->line('アカウント設定から、パスワード再設定のリクエストを受け付けました。')
            ->line('下のボタンから新しいパスワードを設定してください。')
            ->action('パスワードを再設定する', $this->resetUrl($email))
            ->line('このリンクの有効期限は 60 分です。')
            ->line('身に覚えがない場合は、このメールを破棄してください。');
    }

    private function resetUrl(string $email): string
    {
        $baseUrl = rtrim((string) config('app.url'), '/');

        return "{$baseUrl}/reset-password?token={$this->token}&email={$email}";
    }
}
