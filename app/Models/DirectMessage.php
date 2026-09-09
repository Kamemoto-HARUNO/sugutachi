<?php

namespace App\Models;

use App\Models\Concerns\UsesPublicIdRouteKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DirectMessage extends Model
{
    use UsesPublicIdRouteKey;

    protected $guarded = ['id'];

    public function thread(): BelongsTo
    {
        return $this->belongsTo(DirectMessageThread::class);
    }

    protected function casts(): array
    {
        return ['body_encrypted' => 'encrypted', 'attachment_key' => 'encrypted', 'sent_at' => 'datetime', 'read_at' => 'datetime', 'expires_at' => 'datetime', 'deleted_at' => 'datetime'];
    }

    public function scopeVisibleContent($query)
    {
        return $query->whereNull('deleted_at')->where('expires_at', '>', now())->where(function ($q) {
            foreach (['user' => 'userAccount', 'therapist' => 'therapistAccount'] as $role => $relation) {
                $q->orWhere(fn ($q) => $q->where('sender_role', $role)->whereHas('thread.relationship.'.$relation,
                    fn ($q) => $q->where(fn ($q) => $q->whereNull('withdrawn_at')->orWhere('withdrawn_at', '>', now()->subDays(config('direct_messages.withdrawal_retention_days'))))));
            }
        });
    }

    public function isVisible(): bool
    {
        if ($this->deleted_at || $this->expires_at->isPast()) {
            return false;
        }
        $account = $this->thread->relationship->{$this->sender_role === 'user' ? 'userAccount' : 'therapistAccount'};

        return $account && (! $account->withdrawn_at || $account->withdrawn_at->copy()->addDays(config('direct_messages.withdrawal_retention_days'))->isFuture());
    }
}
