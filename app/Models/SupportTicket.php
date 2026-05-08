<?php

namespace App\Models;

use App\Models\Concerns\UsesPublicIdRouteKey;
use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Guarded(['id'])]
class SupportTicket extends Model
{
    use UsesPublicIdRouteKey;

    public const STATUS_OPEN = 'open';

    public const STATUS_COMPLETED = 'completed';

    public const ORIGIN_USER = 'user';

    public const ORIGIN_THERAPIST = 'therapist';

    public const ORIGIN_ADMIN = 'admin';

    public const CATEGORIES = [
        'service',
        'account',
        'booking',
        'payment',
        'safety',
        'other',
    ];

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'created_by_account_id');
    }

    public function completedByAdmin(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'completed_by_admin_account_id');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(SupportTicketMessage::class)->oldest('sent_at')->oldest('id');
    }

    public function latestMessage(): HasMany
    {
        return $this->hasMany(SupportTicketMessage::class)->latest('sent_at')->latest('id');
    }

    public function isOpen(): bool
    {
        return $this->status === self::STATUS_OPEN;
    }

    protected function casts(): array
    {
        return [
            'completed_at' => 'datetime',
            'last_message_at' => 'datetime',
        ];
    }
}
