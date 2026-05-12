<?php

namespace App\Services\Support;

use App\Models\Account;
use App\Models\IdentityVerification;
use App\Models\SupportStepDelivery;
use App\Models\SupportStepScenario;
use App\Models\SupportTicket;
use App\Models\SupportTicketMessage;
use App\Services\Notifications\SupportTicketNotificationService;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class SupportStepDeliveryService
{
    public const MAX_RETRY_COUNT = 3;

    public function __construct(
        private readonly SupportTicketNotificationService $notificationService,
    ) {
    }

    /**
     * @return array{sent: int, skipped: int, failed: int}
     */
    public function processDueScenarios(?CarbonInterface $now = null): array
    {
        $now = $this->jstNow($now);
        $sendTime = $now->format('H:i').':00';
        $sendTimeShort = $now->format('H:i');
        $result = ['sent' => 0, 'skipped' => 0, 'failed' => 0];

        SupportStepScenario::query()
            ->where('status', SupportStepScenario::STATUS_ACTIVE)
            ->whereIn('send_time', [$sendTime, $sendTimeShort])
            ->orderBy('priority')
            ->orderBy('created_at')
            ->orderBy('id')
            ->get()
            ->each(function (SupportStepScenario $scenario) use ($now, &$result): void {
                $this->eligibleAccountsQuery($scenario, $now)
                    ->orderBy('id')
                    ->chunkById(100, function (Collection $accounts) use ($scenario, $now, &$result): void {
                        foreach ($accounts as $account) {
                            $delivery = $this->deliverToAccount($scenario, $account, SupportStepDelivery::TYPE_SCHEDULED, null, $now);
                            $result[$this->resultKey($delivery)]++;
                        }
                    });
            });

        return $result;
    }

    public function preview(SupportStepScenario $scenario, ?CarbonInterface $now = null): array
    {
        $now = $this->jstNow($now);
        $conditionMatchCount = (clone $this->eligibleAccountsQuery($scenario, $now))->count();

        $sendableCount = (clone $this->eligibleAccountsQuery($scenario, $now))
            ->whereDoesntHave('supportStepDeliveries', fn (Builder $query) => $query
                    ->where('support_step_scenario_id', $scenario->id)
                    ->where('status', SupportStepDelivery::STATUS_SENT)
                    ->where('delivery_type', '!=', SupportStepDelivery::TYPE_TEST))
            ->whereDoesntHave('supportStepDeliveries', fn (Builder $query) => $query
                    ->whereDate('scheduled_for_date', $now->toDateString())
                    ->where('status', SupportStepDelivery::STATUS_SENT)
                    ->where('delivery_type', '!=', SupportStepDelivery::TYPE_TEST))
            ->count();

        return [
            'condition_match_count' => $conditionMatchCount,
            'sendable_count' => $sendableCount,
        ];
    }

    /**
     * @return array{sent: int, skipped: int, failed: int}
     */
    public function runManually(SupportStepScenario $scenario, Account $admin, ?CarbonInterface $now = null): array
    {
        $now = $this->jstNow($now);
        $result = ['sent' => 0, 'skipped' => 0, 'failed' => 0];

        $this->eligibleAccountsQuery($scenario, $now)
            ->orderBy('id')
            ->chunkById(100, function (Collection $accounts) use ($scenario, $admin, $now, &$result): void {
                foreach ($accounts as $account) {
                    $delivery = $this->deliverToAccount($scenario, $account, SupportStepDelivery::TYPE_MANUAL, $admin, $now);
                    $result[$this->resultKey($delivery)]++;
                }
            });

        return $result;
    }

    public function sendTest(SupportStepScenario $scenario, Account $admin, ?CarbonInterface $now = null): SupportStepDelivery
    {
        return $this->deliverToAccount($scenario, $admin, SupportStepDelivery::TYPE_TEST, $admin, $this->jstNow($now));
    }

    public function eligibleAccountsQuery(SupportStepScenario $scenario, ?CarbonInterface $now = null): Builder
    {
        $now = $this->jstNow($now);
        $eligibleDate = $now->subDays($scenario->elapsed_days)->toDateString();

        return Account::query()
            ->with(['latestIdentityVerification', 'roleAssignments'])
            ->where('status', Account::STATUS_ACTIVE)
            ->whereNull('deleted_at')
            ->whereDate('created_at', '<=', $eligibleDate)
            ->whereHas('roleAssignments', fn (Builder $query) => $this->applyRoleScope($query, $scenario->target_role))
            ->when(
                $scenario->identity_verification_status === SupportStepScenario::IDENTITY_UNVERIFIED,
                fn (Builder $query) => $query->whereDoesntHave('identityVerifications'),
            )
            ->when(
                $scenario->identity_verification_status === SupportStepScenario::IDENTITY_APPROVED,
                fn (Builder $query) => $query->whereHas('latestIdentityVerification', fn (Builder $identityQuery) => $identityQuery
                    ->where('status', IdentityVerification::STATUS_APPROVED)),
            )
            ->when(
                $scenario->identity_verification_status === SupportStepScenario::IDENTITY_REJECTED,
                fn (Builder $query) => $query->whereHas('latestIdentityVerification', fn (Builder $identityQuery) => $identityQuery
                    ->where('status', IdentityVerification::STATUS_REJECTED)),
            );
    }

    private function deliverToAccount(
        SupportStepScenario $scenario,
        Account $account,
        string $deliveryType,
        ?Account $admin,
        CarbonImmutable $now,
    ): SupportStepDelivery {
        return DB::transaction(function () use ($scenario, $account, $deliveryType, $admin, $now): SupportStepDelivery {
            $scenario = SupportStepScenario::query()->lockForUpdate()->findOrFail($scenario->id);
            $account = Account::query()->lockForUpdate()->findOrFail($account->id);
            $requesterRole = $this->requesterRoleFor($scenario, $account);
            $sender = $admin ?? $scenario->createdBy()->firstOrFail();

            if ($scenario->isArchived()) {
                return $this->recordSkipped($scenario, $account, $requesterRole, $deliveryType, SupportStepDelivery::SKIP_ARCHIVED, $now);
            }

            if ($deliveryType !== SupportStepDelivery::TYPE_TEST && $this->hasSentScenario($scenario, $account)) {
                return $this->recordSkipped($scenario, $account, $requesterRole, $deliveryType, SupportStepDelivery::SKIP_ALREADY_SENT, $now);
            }

            if ($deliveryType !== SupportStepDelivery::TYPE_TEST && $this->hasSentToday($account, $now)) {
                return $this->recordSkipped($scenario, $account, $requesterRole, $deliveryType, SupportStepDelivery::SKIP_DAILY_LIMIT, $now);
            }

            $failedCount = $deliveryType === SupportStepDelivery::TYPE_TEST
                ? 0
                : SupportStepDelivery::query()
                    ->where('support_step_scenario_id', $scenario->id)
                    ->where('account_id', $account->id)
                    ->where('status', SupportStepDelivery::STATUS_FAILED)
                    ->where('delivery_type', '!=', SupportStepDelivery::TYPE_TEST)
                    ->count();

            if ($failedCount >= self::MAX_RETRY_COUNT) {
                return $this->recordFailed($scenario, $account, $requesterRole, $deliveryType, '最大再試行回数に達しました。', $failedCount, $now);
            }

            try {
                $body = $this->renderMessage($scenario->message_body, $account, $requesterRole);
                [$ticket, $message, $isNewTicket] = $this->createTicketMessage($scenario, $account, $requesterRole, $sender, $body, $now);

                $delivery = SupportStepDelivery::create([
                    'support_step_scenario_id' => $scenario->id,
                    'account_id' => $account->id,
                    'support_ticket_id' => $ticket->id,
                    'support_ticket_message_id' => $message->id,
                    'requester_role' => $requesterRole,
                    'delivery_type' => $deliveryType,
                    'status' => SupportStepDelivery::STATUS_SENT,
                    'retry_count' => $failedCount,
                    'scheduled_for_date' => $now->toDateString(),
                    'attempted_at' => $now,
                    'sent_at' => $now,
                    'scenario_snapshot' => $this->scenarioSnapshot($scenario),
                    'target_snapshot' => $this->targetSnapshot($account, $requesterRole),
                ]);

                $this->notificationService->notifyUserFromAdmin($ticket->refresh(), $message->load(['ticket', 'sender']), $isNewTicket);

                return $delivery;
            } catch (\Throwable $exception) {
                report($exception);

                return $this->recordFailed($scenario, $account, $requesterRole, $deliveryType, $exception->getMessage(), $failedCount + 1, $now);
            }
        });
    }

    private function createTicketMessage(
        SupportStepScenario $scenario,
        Account $account,
        string $requesterRole,
        Account $sender,
        string $body,
        CarbonImmutable $now,
    ): array {
        $ticket = SupportTicket::query()
            ->where('account_id', $account->id)
            ->where('requester_role', $requesterRole)
            ->where('title', $scenario->ticket_title)
            ->orderByDesc('id')
            ->lockForUpdate()
            ->first();

        $isNewTicket = ! $ticket;

        if (! $ticket) {
            $ticket = SupportTicket::create([
                'public_id' => 'sup_'.Str::ulid(),
                'account_id' => $account->id,
                'requester_role' => $requesterRole,
                'origin' => SupportTicket::ORIGIN_ADMIN,
                'title' => $scenario->ticket_title,
                'category' => $scenario->ticket_category,
                'status' => SupportTicket::STATUS_OPEN,
                'created_by_account_id' => $sender->id,
                'last_message_at' => $now,
            ]);
        } else {
            $ticket->forceFill([
                'status' => SupportTicket::STATUS_OPEN,
                'completed_by_admin_account_id' => null,
                'completed_at' => null,
                'last_message_at' => $now,
            ])->save();
        }

        $message = $ticket->messages()->create([
            'sender_account_id' => $sender->id,
            'sender_role' => SupportTicketMessage::SENDER_ADMIN,
            'message_type' => SupportTicketMessage::TYPE_TEXT,
            'body_encrypted' => Crypt::encryptString($body),
            'sent_at' => $now,
            'read_by_admin_at' => $now,
        ]);

        return [$ticket, $message, $isNewTicket];
    }

    private function recordSkipped(
        SupportStepScenario $scenario,
        Account $account,
        string $requesterRole,
        string $deliveryType,
        string $reason,
        CarbonImmutable $now,
    ): SupportStepDelivery {
        return SupportStepDelivery::create([
            'support_step_scenario_id' => $scenario->id,
            'account_id' => $account->id,
            'requester_role' => $requesterRole,
            'delivery_type' => $deliveryType,
            'status' => SupportStepDelivery::STATUS_SKIPPED,
            'skip_reason' => $reason,
            'scheduled_for_date' => $now->toDateString(),
            'attempted_at' => $now,
            'scenario_snapshot' => $this->scenarioSnapshot($scenario),
            'target_snapshot' => $this->targetSnapshot($account, $requesterRole),
        ]);
    }

    private function recordFailed(
        SupportStepScenario $scenario,
        Account $account,
        string $requesterRole,
        string $deliveryType,
        string $message,
        int $retryCount,
        CarbonImmutable $now,
    ): SupportStepDelivery {
        return SupportStepDelivery::create([
            'support_step_scenario_id' => $scenario->id,
            'account_id' => $account->id,
            'requester_role' => $requesterRole,
            'delivery_type' => $deliveryType,
            'status' => SupportStepDelivery::STATUS_FAILED,
            'error_message' => Str::limit($message, 1000, ''),
            'retry_count' => min($retryCount, self::MAX_RETRY_COUNT),
            'scheduled_for_date' => $now->toDateString(),
            'attempted_at' => $now,
            'scenario_snapshot' => $this->scenarioSnapshot($scenario),
            'target_snapshot' => $this->targetSnapshot($account, $requesterRole),
        ]);
    }

    private function hasSentScenario(SupportStepScenario $scenario, Account $account): bool
    {
        return SupportStepDelivery::query()
            ->where('support_step_scenario_id', $scenario->id)
            ->where('account_id', $account->id)
            ->where('status', SupportStepDelivery::STATUS_SENT)
            ->where('delivery_type', '!=', SupportStepDelivery::TYPE_TEST)
            ->lockForUpdate()
            ->exists();
    }

    private function hasSentToday(Account $account, CarbonImmutable $now): bool
    {
        return SupportStepDelivery::query()
            ->where('account_id', $account->id)
            ->where('status', SupportStepDelivery::STATUS_SENT)
            ->where('delivery_type', '!=', SupportStepDelivery::TYPE_TEST)
            ->whereDate('scheduled_for_date', $now->toDateString())
            ->lockForUpdate()
            ->exists();
    }

    private function requesterRoleFor(SupportStepScenario $scenario, Account $account): string
    {
        if ($scenario->target_role !== SupportStepScenario::TARGET_BOTH) {
            return $scenario->target_role;
        }

        $roles = $account->relationLoaded('roleAssignments')
            ? $account->roleAssignments
            : $account->roleAssignments()->get();

        return $roles->contains(fn ($role) => $role->role === SupportStepScenario::TARGET_USER && $role->status === Account::STATUS_ACTIVE && $role->revoked_at === null)
            ? SupportStepScenario::TARGET_USER
            : SupportStepScenario::TARGET_THERAPIST;
    }

    private function applyRoleScope(Builder $query, string $targetRole): void
    {
        $query
            ->where('status', Account::STATUS_ACTIVE)
            ->whereNull('revoked_at');

        if ($targetRole === SupportStepScenario::TARGET_BOTH) {
            $query->whereIn('role', [SupportStepScenario::TARGET_USER, SupportStepScenario::TARGET_THERAPIST]);

            return;
        }

        $query->where('role', $targetRole);
    }

    private function renderMessage(string $body, Account $account, string $requesterRole): string
    {
        $baseUrl = rtrim((string) config('service_meta.base_url', config('app.url')), '/');
        $verificationPath = $requesterRole === SupportStepScenario::TARGET_THERAPIST
            ? '/therapist/identity-verification'
            : '/user/identity-verification';

        return strtr($body, [
            '{user_name}' => $account->display_name ?: 'ゲスト',
            '{user_type}' => $requesterRole === SupportStepScenario::TARGET_THERAPIST ? 'タチキャスト' : '利用者',
            '{registered_date}' => CarbonImmutable::instance($account->created_at)->timezone('Asia/Tokyo')->format('Y年n月j日'),
            '{verification_url}' => $baseUrl.$verificationPath,
        ]);
    }

    private function scenarioSnapshot(SupportStepScenario $scenario): array
    {
        return [
            'public_id' => $scenario->public_id,
            'name' => $scenario->name,
            'target_role' => $scenario->target_role,
            'identity_verification_status' => $scenario->identity_verification_status,
            'elapsed_days' => $scenario->elapsed_days,
            'send_time' => $scenario->send_time,
            'priority' => $scenario->priority,
            'ticket_title' => $scenario->ticket_title,
            'ticket_category' => $scenario->ticket_category,
            'message_body' => $scenario->message_body,
        ];
    }

    private function targetSnapshot(Account $account, string $requesterRole): array
    {
        return [
            'public_id' => $account->public_id,
            'display_name' => $account->display_name,
            'email' => $account->email,
            'status' => $account->status,
            'requester_role' => $requesterRole,
        ];
    }

    private function resultKey(SupportStepDelivery $delivery): string
    {
        return match ($delivery->status) {
            SupportStepDelivery::STATUS_SENT => 'sent',
            SupportStepDelivery::STATUS_FAILED => 'failed',
            default => 'skipped',
        };
    }

    private function jstNow(?CarbonInterface $now = null): CarbonImmutable
    {
        return CarbonImmutable::instance($now ?? now())->timezone('Asia/Tokyo');
    }
}
