<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

#[Guarded(['id'])]
class StripeConnectedAccount extends Model
{
    public const PAYOUT_METHOD_STRIPE_CONNECT = 'stripe_connect';

    public const PAYOUT_METHOD_MANUAL_BANK_TRANSFER = 'manual_bank_transfer';

    public const STATUS_PENDING = 'pending';

    public const STATUS_REQUIREMENTS_DUE = 'requirements_due';

    public const STATUS_ACTIVE = 'active';

    public const STATUS_RESTRICTED = 'restricted';

    public const ACCOUNT_TYPE_MANUAL = 'manual';

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function therapistProfile(): BelongsTo
    {
        return $this->belongsTo(TherapistProfile::class);
    }

    public function paymentIntents(): HasMany
    {
        return $this->hasMany(PaymentIntent::class);
    }

    public function payoutRequests(): HasMany
    {
        return $this->hasMany(PayoutRequest::class);
    }

    public function canReceiveStripeTransfers(): bool
    {
        if (! $this->usesStripeConnect() || ! $this->charges_enabled || blank($this->stripe_account_id)) {
            return false;
        }

        if (app()->environment(['local', 'testing']) && Str::startsWith($this->stripe_account_id, 'acct_preview_')) {
            return false;
        }

        return true;
    }

    public function usesStripeConnect(): bool
    {
        return $this->payout_method === self::PAYOUT_METHOD_STRIPE_CONNECT
            && filled($this->stripe_account_id)
            && ! Str::startsWith((string) $this->stripe_account_id, 'manual_');
    }

    public function usesManualBankTransfer(): bool
    {
        return $this->payout_method === self::PAYOUT_METHOD_MANUAL_BANK_TRANSFER
            || blank($this->stripe_account_id)
            || Str::startsWith((string) $this->stripe_account_id, 'manual_');
    }

    public function manualPayoutRequirements(): array
    {
        if (! $this->usesManualBankTransfer()) {
            return [];
        }

        return array_values(array_filter([
            filled($this->bank_name) ? null : 'bank_name',
            filled($this->bank_branch_name) ? null : 'bank_branch_name',
            filled($this->bank_account_type) ? null : 'bank_account_type',
            filled($this->bank_account_number) ? null : 'bank_account_number',
            filled($this->bank_account_holder_name) ? null : 'bank_account_holder_name',
        ]));
    }

    public function isPayoutReady(): bool
    {
        if ($this->usesManualBankTransfer()) {
            return $this->manualPayoutRequirements() === [];
        }

        return $this->status === self::STATUS_ACTIVE && $this->payouts_enabled;
    }

    public function maskedBankAccountNumber(): ?string
    {
        $accountNumber = preg_replace('/\D+/', '', (string) ($this->bank_account_number ?? ''));

        if ($accountNumber === '') {
            return null;
        }

        $visible = substr($accountNumber, -4);
        $hiddenLength = max(strlen($accountNumber) - strlen($visible), 0);

        return str_repeat('•', $hiddenLength).$visible;
    }

    public function syncManualPayoutState(bool $persist = true): static
    {
        if (! $this->usesManualBankTransfer()) {
            return $this;
        }

        $requirements = $this->manualPayoutRequirements();
        $isReady = $requirements === [];

        $this->forceFill([
            'account_type' => self::ACCOUNT_TYPE_MANUAL,
            'payout_method' => self::PAYOUT_METHOD_MANUAL_BANK_TRANSFER,
            'status' => $isReady ? self::STATUS_ACTIVE : self::STATUS_REQUIREMENTS_DUE,
            'charges_enabled' => false,
            'payouts_enabled' => $isReady,
            'details_submitted' => $isReady,
            'requirements_currently_due_json' => $requirements,
            'requirements_past_due_json' => [],
            'disabled_reason' => null,
            'onboarding_completed_at' => $isReady
                ? ($this->onboarding_completed_at ?? now())
                : null,
            'last_synced_at' => now(),
        ]);

        if ($persist) {
            $this->save();

            return $this->refresh();
        }

        return $this;
    }

    protected function casts(): array
    {
        return [
            'charges_enabled' => 'boolean',
            'payouts_enabled' => 'boolean',
            'details_submitted' => 'boolean',
            'bank_account_number' => 'encrypted',
            'bank_account_holder_name' => 'encrypted',
            'requirements_currently_due_json' => 'array',
            'requirements_past_due_json' => 'array',
            'onboarding_completed_at' => 'datetime',
            'last_synced_at' => 'datetime',
        ];
    }
}
