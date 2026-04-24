<?php

namespace App\Models;

use App\Models\Concerns\UsesPublicIdRouteKey;
use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

#[Guarded(['id'])]
class TherapistAvailabilitySlot extends Model
{
    use SoftDeletes;
    use UsesPublicIdRouteKey;

    public const STATUS_PUBLISHED = 'published';

    public const STATUS_HIDDEN = 'hidden';

    public const STATUS_EXPIRED = 'expired';

    public const DISPATCH_BASE_TYPE_DEFAULT = 'default';

    public const DISPATCH_BASE_TYPE_CUSTOM = 'custom';

    public function therapistProfile(): BelongsTo
    {
        return $this->belongsTo(TherapistProfile::class);
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class, 'availability_slot_id');
    }

    protected function casts(): array
    {
        return [
            'start_at' => 'datetime',
            'end_at' => 'datetime',
            'custom_dispatch_base_lat' => 'decimal:7',
            'custom_dispatch_base_lng' => 'decimal:7',
            'custom_dispatch_base_accuracy_m' => 'integer',
            'deleted_at' => 'datetime',
        ];
    }
}
