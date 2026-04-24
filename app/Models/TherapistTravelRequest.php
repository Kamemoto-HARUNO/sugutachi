<?php

namespace App\Models;

use App\Models\Concerns\UsesPublicIdRouteKey;
use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Guarded(['id'])]
class TherapistTravelRequest extends Model
{
    use UsesPublicIdRouteKey;

    public const STATUS_UNREAD = 'unread';

    public const STATUS_READ = 'read';

    public const STATUS_ARCHIVED = 'archived';

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
            'detected_contact_exchange' => 'boolean',
            'read_at' => 'datetime',
            'archived_at' => 'datetime',
        ];
    }
}
