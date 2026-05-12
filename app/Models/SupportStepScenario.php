<?php

namespace App\Models;

use App\Models\Concerns\UsesPublicIdRouteKey;
use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Guarded(['id'])]
class SupportStepScenario extends Model
{
    use UsesPublicIdRouteKey;

    public const STATUS_DRAFT = 'draft';

    public const STATUS_ACTIVE = 'active';

    public const STATUS_ARCHIVED = 'archived';

    public const TARGET_USER = 'user';

    public const TARGET_THERAPIST = 'therapist';

    public const TARGET_BOTH = 'both';

    public const IDENTITY_UNVERIFIED = 'unverified';

    public const IDENTITY_APPROVED = 'approved';

    public const IDENTITY_REJECTED = 'rejected';

    public const ALLOWED_ELAPSED_DAYS = [1, 3, 7];

    public function deliveries(): HasMany
    {
        return $this->hasMany(SupportStepDelivery::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'created_by_account_id');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'updated_by_account_id');
    }

    public function archivedBy(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'archived_by_account_id');
    }

    public function isArchived(): bool
    {
        return $this->status === self::STATUS_ARCHIVED;
    }

    protected function casts(): array
    {
        return [
            'elapsed_days' => 'integer',
            'priority' => 'integer',
            'archived_at' => 'datetime',
            'send_time' => 'string',
        ];
    }
}
