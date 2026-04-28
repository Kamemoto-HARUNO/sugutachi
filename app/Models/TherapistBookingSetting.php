<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Guarded(['id'])]
class TherapistBookingSetting extends Model
{
    public const TRAVEL_MODE_WALKING = 'walking';
    public const TRAVEL_MODE_BICYCLE = 'bicycle';
    public const TRAVEL_MODE_TRANSIT = 'transit';
    public const TRAVEL_MODE_CAR = 'car';

    public function therapistProfile(): BelongsTo
    {
        return $this->belongsTo(TherapistProfile::class);
    }

    protected function casts(): array
    {
        return [
            'booking_request_lead_time_minutes' => 'integer',
            'max_travel_minutes' => 'integer',
            'scheduled_base_lat' => 'decimal:7',
            'scheduled_base_lng' => 'decimal:7',
            'scheduled_base_accuracy_m' => 'integer',
        ];
    }
}
