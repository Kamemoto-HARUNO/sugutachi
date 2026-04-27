<?php

namespace App\Models;

use App\Models\Concerns\UsesPublicIdRouteKey;
use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

#[Guarded(['id'])]
class Booking extends Model
{
    use UsesPublicIdRouteKey;

    public const STATUS_PAYMENT_AUTHORIZING = 'payment_authorizing';

    public const STATUS_REQUESTED = 'requested';

    public const STATUS_ACCEPTED = 'accepted';

    public const STATUS_REJECTED = 'rejected';

    public const STATUS_EXPIRED = 'expired';

    public const STATUS_PAYMENT_CANCELED = 'payment_canceled';

    public const STATUS_CANCELED = 'canceled';

    public const STATUS_INTERRUPTED = 'interrupted';

    public const STATUS_MOVING = 'moving';

    public const STATUS_ARRIVED = 'arrived';

    public const STATUS_IN_PROGRESS = 'in_progress';

    public const STATUS_THERAPIST_COMPLETED = 'therapist_completed';

    public const STATUS_COMPLETED = 'completed';

    public function hasPendingTherapistAdjustment(): bool
    {
        return $this->therapist_adjustment_proposed_at !== null
            && $this->therapist_adjustment_start_at !== null
            && $this->therapist_adjustment_end_at !== null
            && $this->therapist_adjustment_duration_minutes !== null;
    }

    public function hasPendingNoShowReport(): bool
    {
        return $this->pending_no_show_reported_at !== null
            && $this->pending_no_show_reported_by_account_id !== null
            && filled($this->pending_no_show_reason_code);
    }

    public function hasPendingTherapistNoShowReport(): bool
    {
        return $this->hasPendingNoShowReport()
            && $this->pending_no_show_reported_by_account_id === $this->therapist_account_id
            && $this->pending_no_show_reason_code === 'user_no_show';
    }

    public function pendingNoShowReportedByRole(): ?string
    {
        if (! $this->hasPendingNoShowReport()) {
            return null;
        }

        return match ($this->pending_no_show_reported_by_account_id) {
            $this->user_account_id => 'user',
            $this->therapist_account_id => 'therapist',
            default => 'admin',
        };
    }

    public function clearPendingNoShowReportAttributes(): array
    {
        return [
            'pending_no_show_reported_at' => null,
            'pending_no_show_reported_by_account_id' => null,
            'pending_no_show_reason_code' => null,
            'pending_no_show_note_encrypted' => null,
        ];
    }

    public function availabilitySlot(): BelongsTo
    {
        return $this->belongsTo(TherapistAvailabilitySlot::class, 'availability_slot_id');
    }

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

    public function therapistMenu(): BelongsTo
    {
        return $this->belongsTo(TherapistMenu::class);
    }

    public function serviceAddress(): BelongsTo
    {
        return $this->belongsTo(ServiceAddress::class);
    }

    public function currentQuote(): BelongsTo
    {
        return $this->belongsTo(BookingQuote::class, 'current_quote_id');
    }

    public function canceledBy(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'canceled_by_account_id');
    }

    public function quotes(): HasMany
    {
        return $this->hasMany(BookingQuote::class);
    }

    public function statusLogs(): HasMany
    {
        return $this->hasMany(BookingStatusLog::class);
    }

    public function consents(): HasMany
    {
        return $this->hasMany(BookingConsent::class);
    }

    public function healthChecks(): HasMany
    {
        return $this->hasMany(BookingHealthCheck::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(BookingMessage::class);
    }

    public function paymentIntents(): HasMany
    {
        return $this->hasMany(PaymentIntent::class);
    }

    public function currentPaymentIntent(): HasOne
    {
        return $this->hasOne(PaymentIntent::class)
            ->where('is_current', true)
            ->latestOfMany();
    }

    public function refunds(): HasMany
    {
        return $this->hasMany(Refund::class);
    }

    public function disputes(): HasMany
    {
        return $this->hasMany(StripeDispute::class);
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(Review::class);
    }

    public function reports(): HasMany
    {
        return $this->hasMany(Report::class);
    }

    public function ledgerEntries(): HasMany
    {
        return $this->hasMany(TherapistLedgerEntry::class);
    }

    protected function casts(): array
    {
        return [
            'is_on_demand' => 'boolean',
            'buffer_before_minutes' => 'integer',
            'buffer_after_minutes' => 'integer',
            'therapist_adjustment_duration_minutes' => 'integer',
            'therapist_adjustment_total_amount' => 'integer',
            'therapist_adjustment_therapist_net_amount' => 'integer',
            'therapist_adjustment_platform_fee_amount' => 'integer',
            'therapist_adjustment_matching_fee_amount' => 'integer',
            'therapist_adjustment_buffer_before_minutes' => 'integer',
            'therapist_adjustment_buffer_after_minutes' => 'integer',
            'actual_duration_minutes' => 'integer',
            'settlement_total_amount' => 'integer',
            'settlement_therapist_net_amount' => 'integer',
            'settlement_platform_fee_amount' => 'integer',
            'settlement_matching_fee_amount' => 'integer',
            'uncaptured_extension_amount' => 'integer',
            'requested_start_at' => 'datetime',
            'scheduled_start_at' => 'datetime',
            'scheduled_end_at' => 'datetime',
            'request_expires_at' => 'datetime',
            'therapist_adjustment_proposed_at' => 'datetime',
            'therapist_adjustment_start_at' => 'datetime',
            'therapist_adjustment_end_at' => 'datetime',
            'accepted_at' => 'datetime',
            'confirmed_at' => 'datetime',
            'moving_at' => 'datetime',
            'arrived_at' => 'datetime',
            'arrival_confirmation_code_generated_at' => 'datetime',
            'started_at' => 'datetime',
            'ended_at' => 'datetime',
            'service_completion_reported_at' => 'datetime',
            'completed_at' => 'datetime',
            'completion_confirmation_reminder_sent_at' => 'datetime',
            'canceled_at' => 'datetime',
            'interrupted_at' => 'datetime',
            'pending_no_show_reported_at' => 'datetime',
            'user_snapshot_json' => 'array',
            'therapist_snapshot_json' => 'array',
        ];
    }
}
