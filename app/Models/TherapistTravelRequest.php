<?php

namespace App\Models;

use App\Models\Concerns\UsesPublicIdRouteKey;
use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

#[Guarded(['id'])]
class TherapistTravelRequest extends Model
{
    use UsesPublicIdRouteKey;

    public const STATUS_UNREAD = 'unread';

    public const STATUS_READ = 'read';

    public const STATUS_ARCHIVED = 'archived';

    public const MONITORING_STATUS_UNREVIEWED = 'unreviewed';

    public const MONITORING_STATUS_UNDER_REVIEW = 'under_review';

    public const MONITORING_STATUS_REVIEWED = 'reviewed';

    public const MONITORING_STATUS_ESCALATED = 'escalated';

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

    public function monitoredByAdmin(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'monitored_by_admin_account_id');
    }

    public function adminNotes(): MorphMany
    {
        return $this->morphMany(AdminNote::class, 'target')->oldest('created_at');
    }

    protected function casts(): array
    {
        return [
            'detected_contact_exchange' => 'boolean',
            'read_at' => 'datetime',
            'archived_at' => 'datetime',
            'monitored_at' => 'datetime',
        ];
    }

    public static function statuses(): array
    {
        return [
            self::STATUS_UNREAD,
            self::STATUS_READ,
            self::STATUS_ARCHIVED,
        ];
    }

    public static function supportedMonitoringStatuses(): array
    {
        return [
            self::MONITORING_STATUS_UNREVIEWED,
            self::MONITORING_STATUS_UNDER_REVIEW,
            self::MONITORING_STATUS_REVIEWED,
            self::MONITORING_STATUS_ESCALATED,
        ];
    }
}
