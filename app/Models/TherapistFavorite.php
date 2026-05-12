<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Guarded(['id'])]
class TherapistFavorite extends Model
{
    public const ACTION_COOLDOWN_MINUTES = 10;

    public const ONLINE_NOTIFICATION_COOLDOWN_MINUTES = 60;

    public const AVAILABILITY_NOTIFICATION_COOLDOWN_MINUTES = 60;

    public function userAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'user_account_id');
    }

    public function therapistAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'therapist_account_id');
    }

    public function therapistProfile(): BelongsTo
    {
        return $this->belongsTo(TherapistProfile::class);
    }

    protected function casts(): array
    {
        return [
            'last_action_at' => 'datetime',
            'last_online_notified_at' => 'datetime',
            'last_availability_notified_at' => 'datetime',
        ];
    }
}
