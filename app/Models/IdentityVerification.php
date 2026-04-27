<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Crypt;

#[Guarded(['id'])]
class IdentityVerification extends Model
{
    public const STATUS_APPROVED = 'approved';

    public const STATUS_PENDING = 'pending';

    public const STATUS_REJECTED = 'rejected';

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'reviewed_by_account_id');
    }

    public function resolvedBirthdate(): ?CarbonImmutable
    {
        if (! filled($this->birthdate_encrypted)) {
            return null;
        }

        $birthdate = rescue(
            fn () => Crypt::decryptString($this->birthdate_encrypted),
            null,
            report: false,
        );

        if (! is_string($birthdate) || blank($birthdate)) {
            return null;
        }

        return rescue(
            fn () => CarbonImmutable::createFromFormat('Y-m-d', $birthdate)->startOfDay(),
            null,
            report: false,
        );
    }

    public function resolvedAge(?CarbonImmutable $asOf = null): ?int
    {
        $asOf ??= CarbonImmutable::now()->startOfDay();
        $birthdate = $this->resolvedBirthdate();

        if ($birthdate) {
            return $birthdate->diffInYears($asOf);
        }

        if ($this->birth_year === null) {
            return null;
        }

        return max(0, $asOf->year - (int) $this->birth_year);
    }

    protected function casts(): array
    {
        return [
            'is_age_verified' => 'boolean',
            'self_declared_male' => 'boolean',
            'submitted_at' => 'datetime',
            'reviewed_at' => 'datetime',
            'purge_after' => 'datetime',
        ];
    }
}
