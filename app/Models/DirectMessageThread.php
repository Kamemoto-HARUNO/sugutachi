<?php

namespace App\Models;

use App\Models\Concerns\UsesPublicIdRouteKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class DirectMessageThread extends Model
{
    use UsesPublicIdRouteKey;

    protected $guarded = ['id'];

    public function relationship(): BelongsTo
    {
        return $this->belongsTo(RoleRelationship::class);
    }

    public function userProfile(): BelongsTo
    {
        return $this->belongsTo(UserProfile::class);
    }

    public function therapistProfile(): BelongsTo
    {
        return $this->belongsTo(TherapistProfile::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(DirectMessage::class, 'thread_id');
    }

    public function latestMessage(): HasOne
    {
        return $this->hasOne(DirectMessage::class, 'thread_id')->latestOfMany();
    }

    protected function casts(): array
    {
        return ['last_message_at' => 'datetime', 'first_reply_at' => 'datetime', 'user_muted' => 'boolean', 'therapist_muted' => 'boolean', 'user_archived' => 'boolean', 'therapist_archived' => 'boolean', 'user_paused' => 'boolean', 'therapist_paused' => 'boolean'];
    }
}
