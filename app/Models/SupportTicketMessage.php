<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Guarded(['id'])]
class SupportTicketMessage extends Model
{
    public const TYPE_TEXT = 'text';

    public const TYPE_IMAGE = 'image';

    public const SENDER_USER = 'user';

    public const SENDER_THERAPIST = 'therapist';

    public const SENDER_ADMIN = 'admin';

    public function ticket(): BelongsTo
    {
        return $this->belongsTo(SupportTicket::class, 'support_ticket_id');
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'sender_account_id');
    }

    protected function casts(): array
    {
        return [
            'attachment_size_bytes' => 'integer',
            'sent_at' => 'datetime',
            'read_by_user_at' => 'datetime',
            'read_by_admin_at' => 'datetime',
        ];
    }
}
