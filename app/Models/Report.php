<?php

namespace App\Models;

use App\Models\Concerns\UsesPublicIdRouteKey;
use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Guarded(['id'])]
class Report extends Model
{
    use UsesPublicIdRouteKey;

    public const STATUS_OPEN = 'open';

    public const STATUS_RESOLVED = 'resolved';

    public const SEVERITY_LOW = 'low';

    public const SEVERITY_MEDIUM = 'medium';

    public const SEVERITY_HIGH = 'high';

    public const SEVERITY_CRITICAL = 'critical';

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function reporter(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'reporter_account_id');
    }

    public function target(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'target_account_id');
    }

    public function assignedAdmin(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'assigned_admin_account_id');
    }

    public function actions(): HasMany
    {
        return $this->hasMany(ReportAction::class);
    }

    protected function casts(): array
    {
        return [
            'resolved_at' => 'datetime',
        ];
    }
}
