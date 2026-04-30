<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Api\Concerns\RecordsAdminAuditLogs;
use App\Http\Controllers\Controller;
use App\Http\Resources\AdminCampaignResource;
use App\Models\Campaign;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminCampaignController extends Controller
{
    use AuthorizesAdminRequests;
    use RecordsAdminAuditLogs;

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorizeAdmin($request->user());

        $validated = $request->validate([
            'target_role' => ['nullable', Rule::in([Campaign::TARGET_THERAPIST, Campaign::TARGET_USER])],
            'trigger_type' => ['nullable', Rule::in([
                Campaign::TRIGGER_THERAPIST_REGISTRATION,
                Campaign::TRIGGER_THERAPIST_BOOKING,
                Campaign::TRIGGER_USER_FIRST_BOOKING,
                Campaign::TRIGGER_USER_BOOKING,
            ])],
            'state' => ['nullable', Rule::in(['active', 'scheduled', 'inactive'])],
            'is_enabled' => ['nullable', 'boolean'],
            'is_active' => ['nullable', 'boolean'],
        ]);
        $now = now();

        return AdminCampaignResource::collection(
            Campaign::query()
                ->with(['createdBy', 'updatedBy'])
                ->withCount('applications')
                ->withSum('applications as total_applied_amount', 'applied_amount')
                ->when($validated['target_role'] ?? null, fn ($query, string $targetRole) => $query->where('target_role', $targetRole))
                ->when($validated['trigger_type'] ?? null, fn ($query, string $triggerType) => $query->where('trigger_type', $triggerType))
                ->when(
                    $validated['state'] ?? null,
                    function ($query, string $state) use ($now): void {
                        match ($state) {
                            'active' => $query
                                ->where('is_enabled', true)
                                ->activeAt($now),
                            'scheduled' => $query
                                ->where('is_enabled', true)
                                ->where('starts_at', '>', $now),
                            'inactive' => $query->where(function ($builder) use ($now): void {
                                $builder
                                    ->where('is_enabled', false)
                                    ->orWhere('ends_at', '<', $now);
                            }),
                        };
                    }
                )
                ->when(array_key_exists('is_enabled', $validated), fn ($query) => $query->where('is_enabled', $validated['is_enabled']))
                ->when(
                    array_key_exists('is_active', $validated),
                    function ($query) use ($validated, $now): void {
                        if ($validated['is_active']) {
                            $query
                                ->where('is_enabled', true)
                                ->activeAt($now);

                            return;
                        }

                        $query->where(function ($builder) use ($now): void {
                            $builder
                                ->where('is_enabled', false)
                                ->orWhere('starts_at', '>', $now)
                                ->orWhere('ends_at', '<', $now);
                        });
                    }
                )
                ->orderByDesc('starts_at')
                ->orderByDesc('id')
                ->get()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);

        $validated = $this->validatePayload($request);
        [$startsAt, $endsAt] = $this->resolveWindow($validated);

        if (($validated['is_enabled'] ?? true) === true) {
            $this->assertNoOverlap(
                targetRole: $validated['target_role'],
                triggerType: $validated['trigger_type'],
                startsAt: $startsAt,
                endsAt: $endsAt,
            );
        }

        $campaign = Campaign::create([
            'target_role' => $validated['target_role'],
            'trigger_type' => $validated['trigger_type'],
            'benefit_type' => $validated['benefit_type'],
            'benefit_value' => (int) $validated['benefit_value'],
            'offer_text' => trim($validated['offer_text']),
            'starts_at' => $startsAt,
            'ends_at' => $endsAt,
            'offer_valid_days' => $validated['offer_valid_days'] ?? null,
            'is_enabled' => $validated['is_enabled'] ?? true,
            'created_by_account_id' => $admin->id,
            'updated_by_account_id' => $admin->id,
        ]);

        $campaign->load(['createdBy', 'updatedBy']);
        $this->recordAdminAudit($request, 'campaign.create', $campaign, [], $this->snapshot($campaign));

        return (new AdminCampaignResource($campaign))
            ->response()
            ->setStatusCode(201);
    }

    public function update(Request $request, Campaign $campaign): AdminCampaignResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);

        $validated = $this->validatePayload($request);
        [$startsAt, $endsAt] = $this->resolveWindow($validated);

        if (($validated['is_enabled'] ?? true) === true) {
            $this->assertNoOverlap(
                targetRole: $validated['target_role'],
                triggerType: $validated['trigger_type'],
                startsAt: $startsAt,
                endsAt: $endsAt,
                ignoreCampaignId: $campaign->id,
            );
        }

        $before = $this->snapshot($campaign);

        $campaign->forceFill([
            'target_role' => $validated['target_role'],
            'trigger_type' => $validated['trigger_type'],
            'benefit_type' => $validated['benefit_type'],
            'benefit_value' => (int) $validated['benefit_value'],
            'offer_text' => trim($validated['offer_text']),
            'starts_at' => $startsAt,
            'ends_at' => $endsAt,
            'offer_valid_days' => $validated['offer_valid_days'] ?? null,
            'is_enabled' => $validated['is_enabled'] ?? true,
            'updated_by_account_id' => $admin->id,
        ])->save();

        $campaign->load(['createdBy', 'updatedBy']);
        $this->recordAdminAudit($request, 'campaign.update', $campaign, $before, $this->snapshot($campaign->refresh()));

        return new AdminCampaignResource($campaign);
    }

    public function destroy(Request $request, Campaign $campaign)
    {
        $this->authorizeAdmin($request->user());

        $campaign->loadCount('applications');

        abort_if(
            (int) $campaign->applications_count > 0,
            409,
            '適用実績があるキャンペーンは削除できません。'
        );

        $before = $this->snapshot($campaign);

        $this->recordAdminAudit($request, 'campaign.delete', $campaign, $before, []);
        $campaign->delete();

        return response()->noContent();
    }

    private function assertNoOverlap(
        string $targetRole,
        string $triggerType,
        CarbonImmutable $startsAt,
        ?CarbonImmutable $endsAt = null,
        ?int $ignoreCampaignId = null,
    ): void {
        $overlapExists = Campaign::query()
            ->where('is_enabled', true)
            ->where('target_role', $targetRole)
            ->where('trigger_type', $triggerType)
            ->when($ignoreCampaignId, fn ($query, int $campaignId) => $query->where('id', '!=', $campaignId))
            ->where(function ($query) use ($startsAt): void {
                $query
                    ->whereNull('ends_at')
                    ->orWhere('ends_at', '>=', $startsAt);
            })
            ->when($endsAt, fn ($query, CarbonImmutable $windowEnd) => $query->where('starts_at', '<=', $windowEnd))
            ->exists();

        if ($overlapExists) {
            throw ValidationException::withMessages([
                'starts_at' => ['同じ対象・同じ適用条件の有効キャンペーン期間が重複しています。'],
            ]);
        }
    }

    private function resolveWindow(array $validated): array
    {
        $startsAt = CarbonImmutable::parse($validated['starts_at']);
        $endsAt = filled($validated['ends_at'] ?? null)
            ? CarbonImmutable::parse($validated['ends_at'])
            : null;

        if ($endsAt && $endsAt->lt($startsAt)) {
            throw ValidationException::withMessages([
                'ends_at' => ['終了日時は開始日時以降を指定してください。'],
            ]);
        }

        return [$startsAt, $endsAt];
    }

    private function snapshot(Campaign $campaign): array
    {
        return $campaign->only([
            'id',
            'target_role',
            'trigger_type',
            'benefit_type',
            'benefit_value',
            'offer_text',
            'starts_at',
            'ends_at',
            'offer_valid_days',
            'is_enabled',
            'created_by_account_id',
            'updated_by_account_id',
        ]);
    }

    private function validatePayload(Request $request): array
    {
        $validated = $request->validate([
            'target_role' => ['required', Rule::in([Campaign::TARGET_THERAPIST, Campaign::TARGET_USER])],
            'trigger_type' => ['required', Rule::in([
                Campaign::TRIGGER_THERAPIST_REGISTRATION,
                Campaign::TRIGGER_THERAPIST_BOOKING,
                Campaign::TRIGGER_USER_FIRST_BOOKING,
                Campaign::TRIGGER_USER_BOOKING,
            ])],
            'benefit_type' => ['required', Rule::in([
                Campaign::BENEFIT_TYPE_FIXED_AMOUNT,
                Campaign::BENEFIT_TYPE_PERCENTAGE,
            ])],
            'benefit_value' => ['required', 'integer', 'min:1', 'max:1000000'],
            'offer_text' => ['required', 'string', 'max:500'],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['nullable', 'date'],
            'offer_valid_days' => ['nullable', 'integer', 'min:1', 'max:365'],
            'is_enabled' => ['sometimes', 'boolean'],
        ]);

        $therapistTriggerTypes = [
            Campaign::TRIGGER_THERAPIST_REGISTRATION,
            Campaign::TRIGGER_THERAPIST_BOOKING,
        ];
        $userTriggerTypes = [
            Campaign::TRIGGER_USER_FIRST_BOOKING,
            Campaign::TRIGGER_USER_BOOKING,
        ];

        if (
            $validated['target_role'] === Campaign::TARGET_THERAPIST
            && ! in_array($validated['trigger_type'], $therapistTriggerTypes, true)
        ) {
            throw ValidationException::withMessages([
                'trigger_type' => ['タチキャスト向けで選べるキャンペーン内容ではありません。'],
            ]);
        }

        if (
            $validated['target_role'] === Campaign::TARGET_USER
            && ! in_array($validated['trigger_type'], $userTriggerTypes, true)
        ) {
            throw ValidationException::withMessages([
                'trigger_type' => ['利用者向けで選べるキャンペーン内容ではありません。'],
            ]);
        }

        if (
            $validated['target_role'] === Campaign::TARGET_THERAPIST
            && $validated['benefit_type'] !== Campaign::BENEFIT_TYPE_FIXED_AMOUNT
        ) {
            throw ValidationException::withMessages([
                'benefit_type' => ['タチキャスト向けの特典は固定金額のみ設定できます。'],
            ]);
        }

        if (
            $validated['benefit_type'] === Campaign::BENEFIT_TYPE_PERCENTAGE
            && (int) $validated['benefit_value'] > 100
        ) {
            throw ValidationException::withMessages([
                'benefit_value' => ['割合割引は 100 以下で指定してください。'],
            ]);
        }

        if (
            filled($validated['offer_valid_days'] ?? null)
            && ! (
                $validated['target_role'] === Campaign::TARGET_USER
                && $validated['trigger_type'] === Campaign::TRIGGER_USER_FIRST_BOOKING
            )
        ) {
            throw ValidationException::withMessages([
                'offer_valid_days' => ['オファー有効期限は、利用者向けの初回予約割引でのみ設定できます。'],
            ]);
        }

        return $validated;
    }
}
