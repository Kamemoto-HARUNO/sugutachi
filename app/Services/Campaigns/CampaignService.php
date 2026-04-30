<?php

namespace App\Services\Campaigns;

use App\Models\Account;
use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\BookingQuote;
use App\Models\Campaign;
use App\Models\CampaignApplication;
use App\Models\IdentityVerification;
use App\Models\TherapistLedgerEntry;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

class CampaignService
{
    public function __construct(
        private readonly CampaignBenefitCalculator $benefitCalculator,
    ) {}

    public function publicActiveCampaigns(?CarbonInterface $at = null): Collection
    {
        $at ??= now();

        return Campaign::query()
            ->where('is_enabled', true)
            ->activeAt($at)
            ->orderBy('starts_at')
            ->orderBy('id')
            ->get();
    }

    public function resolveUserQuoteDiscountSnapshot(Account $account, array $amounts, ?CarbonInterface $at = null): ?array
    {
        $at ??= now();

        $bestCampaign = null;
        $bestApplication = null;
        $bestDiscountAmount = 0;

        foreach ($this->userFirstBookingOfferApplications($account, $at) as $application) {
            $campaign = $application->campaign;

            if (! $campaign || $application->status !== CampaignApplication::STATUS_AVAILABLE) {
                continue;
            }

            $discountAmount = $this->benefitCalculator->actualDiscountAmount(
                preDiscountTotalAmount: (int) $amounts['total_amount'],
                platformFeeAmount: (int) $amounts['platform_fee_amount'],
                matchingFeeAmount: (int) $amounts['matching_fee_amount'],
                benefitType: $campaign->benefit_type,
                benefitValue: (int) $campaign->benefit_value,
            );

            if ($discountAmount <= 0) {
                continue;
            }

            if (
                $bestCampaign === null
                || $discountAmount > $bestDiscountAmount
                || ($discountAmount === $bestDiscountAmount && $campaign->starts_at?->gt($bestCampaign->starts_at))
            ) {
                $bestCampaign = $campaign;
                $bestApplication = $application;
                $bestDiscountAmount = $discountAmount;
            }
        }

        foreach ($this->activeUserBookingCampaigns($at) as $campaign) {
            $discountAmount = $this->benefitCalculator->actualDiscountAmount(
                preDiscountTotalAmount: (int) $amounts['total_amount'],
                platformFeeAmount: (int) $amounts['platform_fee_amount'],
                matchingFeeAmount: (int) $amounts['matching_fee_amount'],
                benefitType: $campaign->benefit_type,
                benefitValue: (int) $campaign->benefit_value,
            );

            if ($discountAmount <= 0) {
                continue;
            }

            if (
                $bestCampaign === null
                || $discountAmount > $bestDiscountAmount
                || ($discountAmount === $bestDiscountAmount && $campaign->starts_at?->gt($bestCampaign->starts_at))
            ) {
                $bestCampaign = $campaign;
                $bestApplication = null;
                $bestDiscountAmount = $discountAmount;
            }
        }

        return $bestCampaign ? $this->discountSnapshot($bestCampaign, $bestApplication) : null;
    }

    public function assertQuoteCampaignStillApplicable(Account $account, BookingQuote $quote): void
    {
        $snapshot = $quote->discount_snapshot_json;

        if (! $snapshot || ($snapshot['trigger_type'] ?? null) !== Campaign::TRIGGER_USER_FIRST_BOOKING) {
            return;
        }

        $applicationId = (int) ($snapshot['application_id'] ?? 0);
        $campaignId = (int) ($snapshot['campaign_id'] ?? 0);

        $application = CampaignApplication::query()
            ->where('account_id', $account->id)
            ->where(function ($query) use ($applicationId, $campaignId): void {
                if ($applicationId > 0) {
                    $query->whereKey($applicationId);

                    return;
                }

                $query
                    ->where('campaign_id', $campaignId)
                    ->where('application_key', $this->accountApplicationKey(
                        triggerType: Campaign::TRIGGER_USER_FIRST_BOOKING,
                        campaignId: $campaignId,
                        accountId: $account->id,
                    ));
            })
            ->lockForUpdate()
            ->first();

        abort_unless($application, 409, 'キャンペーン情報が更新されたため、もう一度見積もりを取り直してください。');
        abort_if($application->status !== CampaignApplication::STATUS_AVAILABLE, 409, 'このオファーは現在利用できません。見積もりを取り直してください。');
        abort_if($application->offer_expires_at && $application->offer_expires_at->isPast(), 409, 'このオファーの有効期限が切れたため、もう一度見積もりを取り直してください。');
    }

    public function reserveBookingCampaignApplication(Booking $booking): void
    {
        $booking->loadMissing(['currentQuote', 'userAccount']);
        $quote = $booking->currentQuote;

        if (! $quote || ! $booking->userAccount) {
            return;
        }

        $snapshot = $quote->discount_snapshot_json;

        if (! $snapshot || (int) $quote->discount_amount <= 0 || ! isset($snapshot['campaign_id'])) {
            return;
        }

        if (($snapshot['trigger_type'] ?? null) !== Campaign::TRIGGER_USER_FIRST_BOOKING) {
            return;
        }

        $applicationId = (int) ($snapshot['application_id'] ?? 0);
        $campaignId = (int) $snapshot['campaign_id'];

        $application = CampaignApplication::query()
            ->where('account_id', $booking->user_account_id)
            ->where(function ($query) use ($applicationId, $campaignId, $booking): void {
                if ($applicationId > 0) {
                    $query->whereKey($applicationId);

                    return;
                }

                $query->where('application_key', $this->accountApplicationKey(
                    triggerType: Campaign::TRIGGER_USER_FIRST_BOOKING,
                    campaignId: $campaignId,
                    accountId: $booking->user_account_id,
                ));
            })
            ->lockForUpdate()
            ->first();

        abort_unless($application, 409, 'このオファーは現在利用できません。見積もりを取り直してください。');

        if (
            $application->status === CampaignApplication::STATUS_RESERVED
            && (int) $application->booking_id === (int) $booking->id
        ) {
            return;
        }

        abort_if($application->status !== CampaignApplication::STATUS_AVAILABLE, 409, 'このオファーは現在利用できません。見積もりを取り直してください。');
        abort_if($application->offer_expires_at && $application->offer_expires_at->isPast(), 409, 'このオファーの有効期限が切れたため、見積もりを取り直してください。');

        $application->forceFill([
            'booking_id' => $booking->id,
            'status' => CampaignApplication::STATUS_RESERVED,
            'applied_amount' => (int) $quote->discount_amount,
            'applied_at' => now(),
            'metadata_json' => [
                ...(array) ($application->metadata_json ?? []),
                'booking_public_id' => $booking->public_id,
                'quote_public_id' => $quote->public_id,
                'offer_text' => $snapshot['offer_text'] ?? null,
                'trigger_type' => $snapshot['trigger_type'] ?? null,
            ],
        ])->save();
    }

    public function confirmBookingCampaignApplication(Booking $booking): void
    {
        $booking->loadMissing('currentQuote');
        $quote = $booking->currentQuote;

        if (! $quote) {
            return;
        }

        $snapshot = $quote->discount_snapshot_json;

        if (! $snapshot || (int) $quote->discount_amount <= 0 || ! isset($snapshot['campaign_id'])) {
            return;
        }

        $triggerType = (string) ($snapshot['trigger_type'] ?? '');

        if ($triggerType === Campaign::TRIGGER_USER_FIRST_BOOKING) {
            $this->consumeReservedFirstBookingOffer($booking, $quote, $snapshot);

            return;
        }

        if ($triggerType === Campaign::TRIGGER_USER_BOOKING) {
            $this->recordConfirmedUserBookingCampaign($booking, $quote, $snapshot);
        }
    }

    public function restoreBookingCampaignApplication(
        Booking $booking,
        string $reasonCode,
        ?CarbonInterface $at = null,
    ): void {
        $at ??= now();

        CampaignApplication::query()
            ->with('campaign')
            ->where('booking_id', $booking->id)
            ->lockForUpdate()
            ->get()
            ->each(function (CampaignApplication $application) use ($at, $booking, $reasonCode): void {
                $campaign = $application->campaign;

                if (! $campaign || ! $campaign->isUserFirstBookingOffer()) {
                    return;
                }

                if (! in_array($application->status, [
                    CampaignApplication::STATUS_RESERVED,
                    CampaignApplication::STATUS_CONSUMED,
                ], true)) {
                    return;
                }

                $application->forceFill([
                    'booking_id' => null,
                    'status' => $application->offer_expires_at && $application->offer_expires_at->lt($at)
                        ? CampaignApplication::STATUS_EXPIRED
                        : CampaignApplication::STATUS_AVAILABLE,
                    'applied_amount' => 0,
                    'applied_at' => null,
                    'consumed_at' => null,
                    'metadata_json' => [
                        ...(array) ($application->metadata_json ?? []),
                        'last_restored_reason' => $reasonCode,
                        'last_restored_booking_public_id' => $booking->public_id,
                        'offer_text' => $campaign->offer_text,
                        'trigger_type' => $campaign->trigger_type,
                    ],
                ])->save();
            });
    }

    public function grantTherapistRegistrationBonus(IdentityVerification $verification): void
    {
        $verification->loadMissing('account.roleAssignments');
        $account = $verification->account;

        if (! $account) {
            return;
        }

        foreach ($this->eligibleTherapistRegistrationCampaigns($account) as $campaign) {
            $applicationKey = $this->accountApplicationKey(
                triggerType: Campaign::TRIGGER_THERAPIST_REGISTRATION,
                campaignId: $campaign->id,
                accountId: $account->id,
            );

            DB::transaction(function () use ($account, $applicationKey, $campaign): void {
                $application = CampaignApplication::query()
                    ->where('application_key', $applicationKey)
                    ->lockForUpdate()
                    ->first();

                if ($application) {
                    return;
                }

                $ledgerEntry = TherapistLedgerEntry::create([
                    'therapist_account_id' => $account->id,
                    'entry_type' => TherapistLedgerEntry::TYPE_CAMPAIGN_BONUS,
                    'amount_signed' => (int) $campaign->benefit_value,
                    'status' => TherapistLedgerEntry::STATUS_AVAILABLE,
                    'available_at' => now(),
                    'description' => 'キャンペーン特典',
                    'metadata_json' => [
                        'campaign_id' => $campaign->id,
                        'offer_text' => $campaign->offer_text,
                        'trigger_type' => $campaign->trigger_type,
                    ],
                ]);

                CampaignApplication::create([
                    'campaign_id' => $campaign->id,
                    'account_id' => $account->id,
                    'therapist_ledger_entry_id' => $ledgerEntry->id,
                    'application_key' => $applicationKey,
                    'status' => CampaignApplication::STATUS_GRANTED,
                    'benefit_type' => $campaign->benefit_type,
                    'benefit_value' => (int) $campaign->benefit_value,
                    'applied_amount' => (int) $campaign->benefit_value,
                    'applied_at' => now(),
                    'metadata_json' => [
                        'offer_text' => $campaign->offer_text,
                        'trigger_type' => $campaign->trigger_type,
                    ],
                ]);

                AppNotification::create([
                    'account_id' => $account->id,
                    'notification_type' => 'campaign_bonus_granted',
                    'channel' => 'in_app',
                    'title' => 'キャンペーン特典を付与しました',
                    'body' => $campaign->offer_text,
                    'data_json' => [
                        'campaign_id' => $campaign->id,
                        'amount' => (int) $campaign->benefit_value,
                        'target_path' => '/therapist/balance',
                    ],
                    'status' => AppNotification::STATUS_SENT,
                    'sent_at' => now(),
                ]);
            });
        }
    }

    public function grantUserFirstBookingOffers(IdentityVerification $verification): Collection
    {
        $verification->loadMissing('account.roleAssignments');
        $account = $verification->account;

        if (! $account) {
            return new Collection();
        }

        return $this->userFirstBookingOfferApplications($account, now(), true);
    }

    public function userCampaignOffers(Account $account, ?CarbonInterface $at = null): Collection
    {
        $at ??= now();
        $this->userFirstBookingOfferApplications($account, $at);

        return CampaignApplication::query()
            ->with(['campaign', 'booking'])
            ->where('account_id', $account->id)
            ->whereHas('campaign', fn ($query) => $query
                ->where('target_role', Campaign::TARGET_USER)
                ->where('trigger_type', Campaign::TRIGGER_USER_FIRST_BOOKING))
            ->orderByRaw(sprintf(
                "case status when '%s' then 0 when '%s' then 1 when '%s' then 2 when '%s' then 3 else 4 end",
                CampaignApplication::STATUS_AVAILABLE,
                CampaignApplication::STATUS_RESERVED,
                CampaignApplication::STATUS_CONSUMED,
                CampaignApplication::STATUS_EXPIRED,
            ))
            ->orderByDesc('created_at')
            ->get();
    }

    public function grantTherapistBookingBonus(Booking $booking): void
    {
        $booking->loadMissing('therapistAccount');

        if (! $booking->therapistAccount) {
            return;
        }

        $acceptedAt = $booking->accepted_at ?? now();

        $campaigns = Campaign::query()
            ->where('is_enabled', true)
            ->where('target_role', Campaign::TARGET_THERAPIST)
            ->where('trigger_type', Campaign::TRIGGER_THERAPIST_BOOKING)
            ->activeAt($acceptedAt)
            ->get();

        foreach ($campaigns as $campaign) {
            $applicationKey = $this->bookingApplicationKey(
                triggerType: Campaign::TRIGGER_THERAPIST_BOOKING,
                campaignId: $campaign->id,
                bookingId: $booking->id,
            );

            DB::transaction(function () use ($applicationKey, $booking, $campaign): void {
                $application = CampaignApplication::query()
                    ->where('application_key', $applicationKey)
                    ->lockForUpdate()
                    ->first();

                if ($application) {
                    return;
                }

                $ledgerEntry = TherapistLedgerEntry::create([
                    'therapist_account_id' => $booking->therapist_account_id,
                    'booking_id' => $booking->id,
                    'entry_type' => TherapistLedgerEntry::TYPE_CAMPAIGN_BONUS,
                    'amount_signed' => (int) $campaign->benefit_value,
                    'status' => TherapistLedgerEntry::STATUS_AVAILABLE,
                    'available_at' => now(),
                    'description' => 'キャンペーン特典',
                    'metadata_json' => [
                        'campaign_id' => $campaign->id,
                        'booking_public_id' => $booking->public_id,
                        'offer_text' => $campaign->offer_text,
                        'trigger_type' => $campaign->trigger_type,
                    ],
                ]);

                CampaignApplication::create([
                    'campaign_id' => $campaign->id,
                    'account_id' => $booking->therapist_account_id,
                    'booking_id' => $booking->id,
                    'therapist_ledger_entry_id' => $ledgerEntry->id,
                    'application_key' => $applicationKey,
                    'status' => CampaignApplication::STATUS_GRANTED,
                    'benefit_type' => $campaign->benefit_type,
                    'benefit_value' => (int) $campaign->benefit_value,
                    'applied_amount' => (int) $campaign->benefit_value,
                    'applied_at' => now(),
                    'metadata_json' => [
                        'booking_public_id' => $booking->public_id,
                        'offer_text' => $campaign->offer_text,
                        'trigger_type' => $campaign->trigger_type,
                    ],
                ]);

                AppNotification::create([
                    'account_id' => $booking->therapist_account_id,
                    'notification_type' => 'campaign_bonus_granted',
                    'channel' => 'in_app',
                    'title' => 'キャンペーン特典を付与しました',
                    'body' => $campaign->offer_text,
                    'data_json' => [
                        'campaign_id' => $campaign->id,
                        'booking_public_id' => $booking->public_id,
                        'amount' => (int) $campaign->benefit_value,
                        'target_path' => '/therapist/balance',
                    ],
                    'status' => AppNotification::STATUS_SENT,
                    'sent_at' => now(),
                ]);
            });
        }
    }

    public function discountSnapshot(Campaign $campaign, ?CampaignApplication $application = null): array
    {
        return [
            'campaign_id' => $campaign->id,
            'application_id' => $application?->id,
            'target_role' => $campaign->target_role,
            'trigger_type' => $campaign->trigger_type,
            'benefit_type' => $campaign->benefit_type,
            'benefit_value' => (int) $campaign->benefit_value,
            'offer_text' => $campaign->offer_text,
            'benefit_summary' => $campaign->benefitSummary(),
            'trigger_label' => $campaign->triggerLabel(),
            'offer_valid_days' => $campaign->offer_valid_days,
            'offer_expires_at' => $application?->offer_expires_at,
        ];
    }

    public function activeUserBookingCampaigns(?CarbonInterface $at = null): Collection
    {
        $at ??= now();

        return Campaign::query()
            ->where('is_enabled', true)
            ->where('target_role', Campaign::TARGET_USER)
            ->where('trigger_type', Campaign::TRIGGER_USER_BOOKING)
            ->activeAt($at)
            ->get();
    }

    public function eligibleTherapistRegistrationCampaigns(Account $account): Collection
    {
        if (! $this->hasRoleGrantedWithinCampaignWindow($account, Campaign::TARGET_THERAPIST)) {
            return new Collection();
        }

        $therapistGrantedAt = $this->roleGrantedAt($account, Campaign::TARGET_THERAPIST);

        if (! $therapistGrantedAt) {
            return new Collection();
        }

        return Campaign::query()
            ->where('is_enabled', true)
            ->where('target_role', Campaign::TARGET_THERAPIST)
            ->where('trigger_type', Campaign::TRIGGER_THERAPIST_REGISTRATION)
            ->where('starts_at', '<=', $therapistGrantedAt)
            ->where(function ($builder) use ($therapistGrantedAt): void {
                $builder
                    ->whereNull('ends_at')
                    ->orWhere('ends_at', '>=', $therapistGrantedAt);
            })
            ->get();
    }

    public function eligibleUserFirstBookingCampaigns(Account $account): Collection
    {
        $userGrantedAt = $this->roleGrantedAt($account, Campaign::TARGET_USER);

        if (! $userGrantedAt || $this->hasCountableUserBookingHistory($account)) {
            return new Collection();
        }

        return Campaign::query()
            ->where('is_enabled', true)
            ->where('target_role', Campaign::TARGET_USER)
            ->where('trigger_type', Campaign::TRIGGER_USER_FIRST_BOOKING)
            ->where('starts_at', '<=', $userGrantedAt)
            ->where(function ($builder) use ($userGrantedAt): void {
                $builder
                    ->whereNull('ends_at')
                    ->orWhere('ends_at', '>=', $userGrantedAt);
            })
            ->whereDoesntHave('applications', fn ($query) => $query->where('account_id', $account->id))
            ->get();
    }

    private function consumeReservedFirstBookingOffer(Booking $booking, BookingQuote $quote, array $snapshot): void
    {
        $applicationId = (int) ($snapshot['application_id'] ?? 0);
        $campaignId = (int) ($snapshot['campaign_id'] ?? 0);

        DB::transaction(function () use ($applicationId, $booking, $campaignId, $quote, $snapshot): void {
            $application = CampaignApplication::query()
                ->where('account_id', $booking->user_account_id)
                ->where(function ($query) use ($applicationId, $booking, $campaignId): void {
                    if ($applicationId > 0) {
                        $query->whereKey($applicationId);

                        return;
                    }

                    $query->where('application_key', $this->accountApplicationKey(
                        triggerType: Campaign::TRIGGER_USER_FIRST_BOOKING,
                        campaignId: $campaignId,
                        accountId: $booking->user_account_id,
                    ));
                })
                ->lockForUpdate()
                ->first();

            if (! $application) {
                return;
            }

            if (
                $application->status === CampaignApplication::STATUS_CONSUMED
                && (int) $application->booking_id === (int) $booking->id
            ) {
                return;
            }

            if (
                $application->status === CampaignApplication::STATUS_AVAILABLE
                && $application->booking_id === null
            ) {
                $application->booking_id = $booking->id;
            }

            if (
                $application->status !== CampaignApplication::STATUS_RESERVED
                && $application->status !== CampaignApplication::STATUS_AVAILABLE
            ) {
                return;
            }

            if ((int) $application->booking_id !== (int) $booking->id) {
                return;
            }

            $application->forceFill([
                'status' => CampaignApplication::STATUS_CONSUMED,
                'consumed_at' => now(),
                'applied_amount' => (int) $quote->discount_amount,
                'metadata_json' => [
                    ...(array) ($application->metadata_json ?? []),
                    'booking_public_id' => $booking->public_id,
                    'quote_public_id' => $quote->public_id,
                    'offer_text' => $snapshot['offer_text'] ?? null,
                    'trigger_type' => $snapshot['trigger_type'] ?? null,
                ],
            ])->save();
        });
    }

    private function recordConfirmedUserBookingCampaign(Booking $booking, BookingQuote $quote, array $snapshot): void
    {
        CampaignApplication::query()->firstOrCreate(
            [
                'application_key' => $this->bookingApplicationKey(
                    triggerType: Campaign::TRIGGER_USER_BOOKING,
                    campaignId: (int) $snapshot['campaign_id'],
                    bookingId: $booking->id,
                ),
            ],
            [
                'campaign_id' => (int) $snapshot['campaign_id'],
                'account_id' => $booking->user_account_id,
                'booking_id' => $booking->id,
                'status' => CampaignApplication::STATUS_CONSUMED,
                'benefit_type' => (string) $snapshot['benefit_type'],
                'benefit_value' => (int) $snapshot['benefit_value'],
                'applied_amount' => (int) $quote->discount_amount,
                'applied_at' => now(),
                'consumed_at' => now(),
                'metadata_json' => [
                    'booking_public_id' => $booking->public_id,
                    'quote_public_id' => $quote->public_id,
                    'offer_text' => $snapshot['offer_text'] ?? null,
                    'trigger_type' => $snapshot['trigger_type'] ?? null,
                ],
            ],
        );
    }

    private function userFirstBookingOfferApplications(
        Account $account,
        ?CarbonInterface $at = null,
        bool $sendNotification = false,
    ): Collection {
        $at ??= now();
        $verification = $this->approvedUserVerification($account);

        if ($verification) {
            foreach ($this->eligibleUserFirstBookingCampaigns($account) as $campaign) {
                $offerGrantedAt = $verification->reviewed_at ?? $verification->submitted_at ?? $at;
                $offerExpiresAt = $campaign->offer_valid_days
                    ? $offerGrantedAt->copy()->addDays((int) $campaign->offer_valid_days)
                    : null;

                $application = CampaignApplication::query()->firstOrCreate(
                    [
                        'application_key' => $this->accountApplicationKey(
                            triggerType: Campaign::TRIGGER_USER_FIRST_BOOKING,
                            campaignId: $campaign->id,
                            accountId: $account->id,
                        ),
                    ],
                    [
                        'campaign_id' => $campaign->id,
                        'account_id' => $account->id,
                        'status' => $offerExpiresAt && $offerExpiresAt->lt($at)
                            ? CampaignApplication::STATUS_EXPIRED
                            : CampaignApplication::STATUS_AVAILABLE,
                        'benefit_type' => $campaign->benefit_type,
                        'benefit_value' => (int) $campaign->benefit_value,
                        'applied_amount' => 0,
                        'offer_expires_at' => $offerExpiresAt,
                        'metadata_json' => [
                            'offer_text' => $campaign->offer_text,
                            'trigger_type' => $campaign->trigger_type,
                        ],
                    ],
                );

                if ($sendNotification && $application->wasRecentlyCreated && $application->status === CampaignApplication::STATUS_AVAILABLE) {
                    AppNotification::create([
                        'account_id' => $account->id,
                        'notification_type' => 'campaign_offer_granted',
                        'channel' => 'in_app',
                        'title' => '初回予約オファーを付与しました',
                        'body' => $campaign->offer_text,
                        'data_json' => [
                            'campaign_id' => $campaign->id,
                            'target_path' => '/user/offers',
                        ],
                        'status' => AppNotification::STATUS_SENT,
                        'sent_at' => $at,
                    ]);
                }
            }
        }

        $applications = CampaignApplication::query()
            ->with('campaign')
            ->where('account_id', $account->id)
            ->whereHas('campaign', fn ($query) => $query
                ->where('target_role', Campaign::TARGET_USER)
                ->where('trigger_type', Campaign::TRIGGER_USER_FIRST_BOOKING))
            ->orderBy('id')
            ->get();

        foreach ($applications as $application) {
            if (
                $application->status === CampaignApplication::STATUS_AVAILABLE
                && $application->offer_expires_at
                && $application->offer_expires_at->lt($at)
            ) {
                $application->forceFill([
                    'status' => CampaignApplication::STATUS_EXPIRED,
                ])->save();
                $application->refresh();
            }
        }

        return $applications->load('campaign');
    }

    private function approvedUserVerification(Account $account): ?IdentityVerification
    {
        return IdentityVerification::query()
            ->where('account_id', $account->id)
            ->where('status', IdentityVerification::STATUS_APPROVED)
            ->where('is_age_verified', true)
            ->latest('reviewed_at')
            ->latest('id')
            ->first();
    }

    private function accountApplicationKey(string $triggerType, int $campaignId, int $accountId): string
    {
        return sprintf('%s:%d:account:%d', $triggerType, $campaignId, $accountId);
    }

    private function bookingApplicationKey(string $triggerType, int $campaignId, int $bookingId): string
    {
        return sprintf('%s:%d:booking:%d', $triggerType, $campaignId, $bookingId);
    }

    private function hasCountableUserBookingHistory(Account $account): bool
    {
        return Booking::query()
            ->where('user_account_id', $account->id)
            ->where(function ($query): void {
                $query
                    ->whereNotIn('status', [
                        Booking::STATUS_PAYMENT_CANCELED,
                        Booking::STATUS_REJECTED,
                        Booking::STATUS_EXPIRED,
                        Booking::STATUS_CANCELED,
                    ])
                    ->orWhere(function ($builder): void {
                        $builder
                            ->where('status', Booking::STATUS_CANCELED)
                            ->whereNotNull('accepted_at');
                    });
            })
            ->exists();
    }

    private function hasRoleGrantedWithinCampaignWindow(Account $account, string $role): bool
    {
        return $this->roleGrantedAt($account, $role) !== null;
    }

    private function roleGrantedAt(Account $account, string $role): ?CarbonInterface
    {
        $roleName = $role === Campaign::TARGET_THERAPIST ? 'therapist' : 'user';

        return $account->roleAssignments()
            ->where('role', $roleName)
            ->first()
            ?->granted_at;
    }
}
