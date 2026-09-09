<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

#[Guarded(['id'])]
class UserProfile extends Model
{
    protected static function booted(): void
    {
        static::creating(function (self $profile): void {
            $profile->public_id ??= 'usp_'.Str::ulid();
        });
    }

    public const STATUS_ACTIVE = 'active';

    public const STATUS_INCOMPLETE = 'incomplete';

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    protected function casts(): array
    {
        return [
            'preferences_json' => 'array',
            'touch_ng_json' => 'array',
            'disclose_sensitive_profile_to_therapist' => 'boolean',
            'favorite_notify_online' => 'boolean',
            'favorite_notify_availability' => 'boolean',
            'favorite_email_notifications_enabled' => 'boolean',
        ];
    }
}
