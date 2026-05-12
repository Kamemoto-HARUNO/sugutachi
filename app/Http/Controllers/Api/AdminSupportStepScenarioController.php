<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Api\Concerns\RecordsAdminAuditLogs;
use App\Http\Controllers\Controller;
use App\Http\Resources\SupportStepDeliveryResource;
use App\Http\Resources\SupportStepScenarioResource;
use App\Models\SupportStepDelivery;
use App\Models\SupportStepScenario;
use App\Models\SupportTicket;
use App\Services\Support\SupportStepDeliveryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminSupportStepScenarioController extends Controller
{
    use AuthorizesAdminRequests;
    use RecordsAdminAuditLogs;

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorizeAdmin($request->user());
        $validated = $request->validate([
            'status' => ['nullable', Rule::in(['all', SupportStepScenario::STATUS_DRAFT, SupportStepScenario::STATUS_ACTIVE, SupportStepScenario::STATUS_ARCHIVED])],
            'q' => ['nullable', 'string', 'max:100'],
        ]);

        $today = now('Asia/Tokyo')->toDateString();
        $last7 = now('Asia/Tokyo')->subDays(6)->toDateString();
        $last30 = now('Asia/Tokyo')->subDays(29)->toDateString();

        $scenarios = SupportStepScenario::query()
            ->with('createdBy')
            ->withCount([
                'deliveries as sent_count' => fn ($query) => $query
                    ->where('status', SupportStepDelivery::STATUS_SENT)
                    ->where('delivery_type', '!=', SupportStepDelivery::TYPE_TEST),
                'deliveries as today_sent_count' => fn ($query) => $query
                    ->where('status', SupportStepDelivery::STATUS_SENT)
                    ->where('delivery_type', '!=', SupportStepDelivery::TYPE_TEST)
                    ->whereDate('scheduled_for_date', $today),
                'deliveries as last_7_days_sent_count' => fn ($query) => $query
                    ->where('status', SupportStepDelivery::STATUS_SENT)
                    ->where('delivery_type', '!=', SupportStepDelivery::TYPE_TEST)
                    ->whereDate('scheduled_for_date', '>=', $last7),
                'deliveries as last_30_days_sent_count' => fn ($query) => $query
                    ->where('status', SupportStepDelivery::STATUS_SENT)
                    ->where('delivery_type', '!=', SupportStepDelivery::TYPE_TEST)
                    ->whereDate('scheduled_for_date', '>=', $last30),
            ])
            ->when(($validated['status'] ?? 'all') !== 'all', fn ($query) => $query->where('status', $validated['status']))
            ->when($validated['q'] ?? null, fn ($query, string $term) => $query->where(function ($query) use ($term): void {
                $query->where('name', 'like', "%{$term}%")
                    ->orWhere('ticket_title', 'like', "%{$term}%")
                    ->orWhere('public_id', $term);
            }))
            ->orderByRaw("case when status = ? then 0 when status = ? then 1 else 2 end", [SupportStepScenario::STATUS_ACTIVE, SupportStepScenario::STATUS_DRAFT])
            ->orderBy('priority')
            ->orderByDesc('id')
            ->get();

        $scenarios->each(fn (SupportStepScenario $scenario) => $scenario->setAttribute('can_delete', $scenario->deliveries()->doesntExist()));

        return SupportStepScenarioResource::collection($scenarios);
    }

    public function store(Request $request, SupportStepDeliveryService $service): SupportStepScenarioResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        $validated = $this->validateScenario($request);

        $scenario = SupportStepScenario::create([
            ...$validated,
            'public_id' => 'sss_'.Str::ulid(),
            'created_by_account_id' => $admin->id,
            'updated_by_account_id' => $admin->id,
        ]);

        $this->recordAdminAudit($request, 'support_step_scenario.create', $scenario, [], $this->snapshot($scenario));

        return $this->show($request, $scenario, $service);
    }

    public function show(Request $request, SupportStepScenario $scenario, SupportStepDeliveryService $service): SupportStepScenarioResource
    {
        $this->authorizeAdmin($request->user());
        $scenario->load('createdBy');
        $scenario->setAttribute('can_delete', $scenario->deliveries()->doesntExist());

        return new SupportStepScenarioResource($scenario);
    }

    public function update(Request $request, SupportStepScenario $scenario, SupportStepDeliveryService $service): SupportStepScenarioResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        abort_if($scenario->isArchived(), 409, 'アーカイブ済みのシナリオは編集できません。');
        $validated = $this->validateScenario($request);

        $before = $this->snapshot($scenario);
        $scenario->forceFill([
            ...$validated,
            'updated_by_account_id' => $admin->id,
        ])->save();

        $this->recordAdminAudit($request, 'support_step_scenario.update', $scenario, $before, $this->snapshot($scenario));

        return $this->show($request, $scenario->refresh(), $service);
    }

    public function archive(Request $request, SupportStepScenario $scenario): SupportStepScenarioResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);

        $before = $this->snapshot($scenario);
        $scenario->forceFill([
            'status' => SupportStepScenario::STATUS_ARCHIVED,
            'archived_by_account_id' => $admin->id,
            'archived_at' => now(),
            'updated_by_account_id' => $admin->id,
        ])->save();

        $this->recordAdminAudit($request, 'support_step_scenario.archive', $scenario, $before, $this->snapshot($scenario));

        return new SupportStepScenarioResource($scenario->fresh('createdBy'));
    }

    public function destroy(Request $request, SupportStepScenario $scenario): JsonResponse
    {
        $this->authorizeAdmin($request->user());
        abort_if($scenario->deliveries()->exists(), 409, '送信履歴があるシナリオは削除できません。アーカイブしてください。');

        $before = $this->snapshot($scenario);
        $scenario->delete();
        $this->recordAdminAudit($request, 'support_step_scenario.delete', $scenario, $before, []);

        return response()->json(['data' => ['deleted' => true]]);
    }

    public function preview(Request $request, SupportStepScenario $scenario, SupportStepDeliveryService $service): JsonResponse
    {
        $this->authorizeAdmin($request->user());

        return response()->json(['data' => $service->preview($scenario)]);
    }

    public function testSend(Request $request, SupportStepScenario $scenario, SupportStepDeliveryService $service): SupportStepDeliveryResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        abort_if($scenario->isArchived(), 409, 'アーカイブ済みのシナリオはテスト送信できません。');

        $delivery = $service->sendTest($scenario, $admin);
        $this->recordAdminAudit($request, 'support_step_scenario.test_send', $scenario, [], ['delivery_id' => $delivery->id]);

        return new SupportStepDeliveryResource($delivery->load(['scenario', 'account', 'supportTicket']));
    }

    public function run(Request $request, SupportStepScenario $scenario, SupportStepDeliveryService $service): JsonResponse
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        abort_if($scenario->isArchived(), 409, 'アーカイブ済みのシナリオは手動実行できません。');

        $result = $service->runManually($scenario, $admin);
        $this->recordAdminAudit($request, 'support_step_scenario.manual_run', $scenario, [], $result);

        return response()->json(['data' => $result]);
    }

    public function deliveries(Request $request, ?SupportStepScenario $scenario = null): AnonymousResourceCollection
    {
        $this->authorizeAdmin($request->user());
        $validated = $request->validate([
            'status' => ['nullable', Rule::in(['all', SupportStepDelivery::STATUS_SENT, SupportStepDelivery::STATUS_SKIPPED, SupportStepDelivery::STATUS_FAILED])],
            'delivery_type' => ['nullable', Rule::in(['all', SupportStepDelivery::TYPE_SCHEDULED, SupportStepDelivery::TYPE_MANUAL, SupportStepDelivery::TYPE_TEST])],
        ]);

        $deliveries = SupportStepDelivery::query()
            ->with(['scenario', 'account', 'supportTicket'])
            ->when($scenario, fn ($query) => $query->where('support_step_scenario_id', $scenario->id))
            ->when(($validated['status'] ?? 'all') !== 'all', fn ($query) => $query->where('status', $validated['status']))
            ->when(($validated['delivery_type'] ?? 'all') !== 'all', fn ($query) => $query->where('delivery_type', $validated['delivery_type']))
            ->orderByDesc(DB::raw('coalesce(sent_at, attempted_at, created_at)'))
            ->limit(300)
            ->get();

        return SupportStepDeliveryResource::collection($deliveries);
    }

    private function validateScenario(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'status' => ['required', Rule::in([SupportStepScenario::STATUS_DRAFT, SupportStepScenario::STATUS_ACTIVE])],
            'target_role' => ['required', Rule::in([SupportStepScenario::TARGET_USER, SupportStepScenario::TARGET_THERAPIST, SupportStepScenario::TARGET_BOTH])],
            'identity_verification_status' => ['required', Rule::in([
                SupportStepScenario::IDENTITY_UNVERIFIED,
                SupportStepScenario::IDENTITY_APPROVED,
                SupportStepScenario::IDENTITY_REJECTED,
            ])],
            'elapsed_days' => ['required', 'integer', Rule::in(SupportStepScenario::ALLOWED_ELAPSED_DAYS)],
            'send_time' => ['required', 'date_format:H:i'],
            'priority' => ['required', 'integer', 'min:1', 'max:999'],
            'ticket_title' => ['required', 'string', 'max:160'],
            'ticket_category' => ['required', Rule::in(SupportTicket::CATEGORIES)],
            'message_body' => ['required', 'string', 'min:2', 'max:5000'],
            'internal_notes' => ['nullable', 'string', 'max:5000'],
        ]);
    }

    private function snapshot(SupportStepScenario $scenario): array
    {
        return $scenario->only([
            'id',
            'public_id',
            'name',
            'status',
            'target_role',
            'identity_verification_status',
            'elapsed_days',
            'send_time',
            'priority',
            'ticket_title',
            'ticket_category',
            'message_body',
            'internal_notes',
            'archived_at',
        ]);
    }
}
