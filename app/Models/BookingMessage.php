<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

#[Guarded(['id'])]
class BookingMessage extends Model
{
    public const MODERATION_STATUS_OK = 'ok';

    public const MODERATION_STATUS_BLOCKED = 'blocked';

    public const MODERATION_STATUS_REVIEWED = 'reviewed';

    public const MODERATION_STATUS_ESCALATED = 'escalated';

    public function scopeFlagged(Builder $query): Builder
    {
        return $query->where(function (Builder $query): void {
            $query
                ->whereIn('moderation_status', [
                    self::MODERATION_STATUS_BLOCKED,
                    self::MODERATION_STATUS_ESCALATED,
                ])
                ->orWhere(function (Builder $query): void {
                    $query
                        ->where('detected_contact_exchange', true)
                        ->whereNotIn('moderation_status', [
                            self::MODERATION_STATUS_OK,
                            self::MODERATION_STATUS_REVIEWED,
                        ]);
                });
        });
    }

    public static function moderationStatuses(): array
    {
        return [
            self::MODERATION_STATUS_OK,
            self::MODERATION_STATUS_BLOCKED,
            self::MODERATION_STATUS_REVIEWED,
            self::MODERATION_STATUS_ESCALATED,
        ];
    }

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'sender_account_id');
    }

    public function moderatedByAdmin(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'moderated_by_admin_account_id');
    }

    public function adminNotes(): MorphMany
    {
        return $this->morphMany(AdminNote::class, 'target')->oldest('created_at');
    }

    protected function casts(): array
    {
        return [
            'detected_contact_exchange' => 'boolean',
            'sent_at' => 'datetime',
            'read_at' => 'datetime',
            'moderated_at' => 'datetime',
        ];
    }
}
