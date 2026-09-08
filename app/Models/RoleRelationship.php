<?php

namespace App\Models;

use App\Models\Concerns\UsesPublicIdRouteKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RoleRelationship extends Model
{
    use UsesPublicIdRouteKey;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['user_blocked_at' => 'datetime', 'therapist_blocked_at' => 'datetime'];
    }

    public function userAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'user_account_id');
    }

    public function therapistAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'therapist_account_id');
    }

    public function accountId(string $role): int
    {
        return (int) $this->getAttribute($role.'_account_id');
    }
}
