<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Guarded(['id'])]
class TherapistPricingRule extends Model
{
    public function therapistProfile(): BelongsTo
    {
        return $this->belongsTo(TherapistProfile::class);
    }

    public function therapistMenu(): BelongsTo
    {
        return $this->belongsTo(TherapistMenu::class);
    }

    protected function casts(): array
    {
        return [
            'condition_json' => 'array',
            'is_active' => 'boolean',
        ];
    }
}
