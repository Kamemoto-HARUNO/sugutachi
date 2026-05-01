<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Guarded(['id'])]
class PrivatePhotoViewSession extends Model
{
    public const CLOSE_REASON_AUTO_HIDDEN = 'auto_hidden';

    public const CLOSE_REASON_EXPIRED = 'expired';

    public const CLOSE_REASON_FETCH_FAILED = 'fetch_failed';

    public const CLOSE_REASON_MANUAL = 'manual';

    public const CLOSE_REASON_NAVIGATED = 'navigated';

    public const CLOSE_REASON_SUPERSEDED = 'superseded';

    public const CLOSE_REASON_TAB_HIDDEN = 'tab_hidden';

    public const DISPLAY_SECONDS = 5;

    public const LOCK_HOURS = 24;

    public function therapistProfile(): BelongsTo
    {
        return $this->belongsTo(TherapistProfile::class);
    }

    public function viewer(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'viewer_account_id');
    }

    protected function casts(): array
    {
        return [
            'opened_at' => 'datetime',
            'display_started_at' => 'datetime',
            'expires_at' => 'datetime',
            'locked_until' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }
}
