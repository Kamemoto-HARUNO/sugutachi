<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Guarded(['id'])]
class SupportStepDelivery extends Model
{
    public const TYPE_SCHEDULED = 'scheduled';

    public const TYPE_MANUAL = 'manual';

    public const TYPE_TEST = 'test';

    public const STATUS_SENT = 'sent';

    public const STATUS_SKIPPED = 'skipped';

    public const STATUS_FAILED = 'failed';

    public const SKIP_ALREADY_SENT = 'already_sent';

    public const SKIP_DAILY_LIMIT = 'daily_limit';

    public const SKIP_ARCHIVED = 'scenario_archived';

    public const SKIP_EXISTING_TICKET_TITLE = 'existing_ticket_title';

    public function scenario(): BelongsTo
    {
        return $this->belongsTo(SupportStepScenario::class, 'support_step_scenario_id');
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function supportTicket(): BelongsTo
    {
        return $this->belongsTo(SupportTicket::class);
    }

    public function supportTicketMessage(): BelongsTo
    {
        return $this->belongsTo(SupportTicketMessage::class);
    }

    protected function casts(): array
    {
        return [
            'retry_count' => 'integer',
            'scheduled_for_date' => 'date',
            'attempted_at' => 'datetime',
            'sent_at' => 'datetime',
            'scenario_snapshot' => 'array',
            'target_snapshot' => 'array',
        ];
    }
}
