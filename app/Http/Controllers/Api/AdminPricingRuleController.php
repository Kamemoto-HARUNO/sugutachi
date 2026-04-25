<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Api\Concerns\RecordsAdminAuditLogs;
use App\Http\Controllers\Api\Concerns\ResolvesAdminFilterIds;
use App\Http\Controllers\Controller;
use App\Http\Resources\AdminPricingRuleResource;
use App\Models\AdminNote;
use App\Models\TherapistMenu;
use App\Models\TherapistPricingRule;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Validation\Rule;

class AdminPricingRuleController extends Controller
{
    use AuthorizesAdminRequests;
    use RecordsAdminAuditLogs;
    use ResolvesAdminFilterIds;

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorizeAdmin($request->user());

        $validated = $request->validate([
            'account_id' => ['nullable', 'string', 'max:36'],
            'therapist_profile_id' => ['nullable', 'string', 'max:36'],
            'therapist_menu_id' => ['nullable', 'string', 'max:36'],
            'rule_type' => ['nullable', Rule::in(TherapistPricingRule::supportedRuleTypes())],
            'adjustment_bucket' => ['nullable', Rule::in(['profile_adjustment', 'demand_fee'])],
            'monitoring_flag' => ['nullable', Rule::in(TherapistPricingRule::supportedMonitoringFlags())],
            'has_monitoring_flags' => ['nullable', 'boolean'],
            'monitoring_status' => ['nullable', Rule::in(TherapistPricingRule::supportedMonitoringStatuses())],
            'monitored_by_admin_account_id' => ['nullable', 'string', 'max:36'],
            'adjustment_type' => ['nullable', Rule::in([
                TherapistPricingRule::ADJUSTMENT_TYPE_FIXED_AMOUNT,
                TherapistPricingRule::ADJUSTMENT_TYPE_PERCENTAGE,
            ])],
            'scope' => ['nullable', Rule::in(['profile', 'menu'])],
            'is_active' => ['nullable', 'boolean'],
            'has_notes' => ['nullable', 'boolean'],
            'q' => ['nullable', 'string', 'max:100'],
            'sort' => ['nullable', Rule::in(['created_at', 'updated_at', 'priority', 'adjustment_amount'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
        ]);

        $accountId = $this->resolveAccountId($validated['account_id'] ?? null);
        $therapistProfileId = $this->resolveTherapistProfileId($validated['therapist_profile_id'] ?? null);
        $therapistMenuId = $this->resolveTherapistMenuId($validated['therapist_menu_id'] ?? null);
        $monitoredByAdminId = $this->resolveAccountId($validated['monitored_by_admin_account_id'] ?? null);
        $sort = $validated['sort'] ?? 'priority';
        $direction = $validated['direction'] ?? 'asc';

        return AdminPricingRuleResource::collection(
            TherapistPricingRule::query()
                ->with(['therapistProfile.account', 'therapistMenu', 'monitoredByAdmin'])
                ->withCount('adminNotes')
                ->when($accountId, fn ($query, int $id) => $query->whereHas('therapistProfile', fn ($profile) => $profile->where('account_id', $id)))
                ->when($therapistProfileId, fn ($query, int $id) => $query->where('therapist_profile_id', $id))
                ->when($therapistMenuId, fn ($query, int $id) => $query->where('therapist_menu_id', $id))
                ->when($validated['rule_type'] ?? null, fn ($query, string $ruleType) => $query->where('rule_type', $ruleType))
                ->when(
                    $validated['adjustment_bucket'] ?? null,
                    function ($query, string $bucket): void {
                        $query->whereIn('rule_type', $bucket === 'profile_adjustment'
                            ? [TherapistPricingRule::RULE_TYPE_USER_PROFILE_ATTRIBUTE]
                            : [
                                TherapistPricingRule::RULE_TYPE_TIME_BAND,
                                TherapistPricingRule::RULE_TYPE_WALKING_TIME_RANGE,
                                TherapistPricingRule::RULE_TYPE_DEMAND_LEVEL,
                            ]);
                    }
                )
                ->when(
                    $validated['adjustment_type'] ?? null,
                    fn ($query, string $adjustmentType) => $query->where('adjustment_type', $adjustmentType)
                )
                ->when(
                    $validated['monitoring_flag'] ?? null,
                    fn ($query, string $flag) => $query->withMonitoringFlag($flag)
                )
                ->when(
                    $validated['monitoring_status'] ?? null,
                    fn ($query, string $status) => $query->where('monitoring_status', $status)
                )
                ->when(
                    $monitoredByAdminId,
                    fn ($query, int $id) => $query->where('monitored_by_admin_account_id', $id)
                )
                ->when(
                    array_key_exists('has_monitoring_flags', $validated),
                    fn ($query) => $validated['has_monitoring_flags']
                        ? $query->needsMonitoring()
                        : $query->whereNot(fn ($nested) => $nested->needsMonitoring())
                )
                ->when(
                    $validated['scope'] ?? null,
                    fn ($query, string $scope) => $scope === 'menu'
                        ? $query->whereNotNull('therapist_menu_id')
                        : $query->whereNull('therapist_menu_id')
                )
                ->when(
                    array_key_exists('is_active', $validated),
                    fn ($query) => $query->where('is_active', (bool) $validated['is_active'])
                )
                ->when(
                    array_key_exists('has_notes', $validated),
                    fn ($query) => $validated['has_notes']
                        ? $query->whereHas('adminNotes')
                        : $query->whereDoesntHave('adminNotes')
                )
                ->when($validated['q'] ?? null, function ($query, string $term): void {
                    $query->where(function ($query) use ($term): void {
                        $query
                            ->where('id', is_numeric($term) ? (int) $term : 0)
                            ->orWhereHas('therapistProfile', fn ($profile) => $profile
                                ->where('public_id', $term)
                                ->orWhere('public_name', 'like', "%{$term}%")
                                ->orWhereHas('account', fn ($account) => $account
                                    ->where('public_id', $term)
                                    ->orWhere('email', 'like', "%{$term}%")
                                    ->orWhere('display_name', 'like', "%{$term}%")))
                            ->orWhereHas('therapistMenu', fn ($menu) => $menu
                                ->where('public_id', $term)
                                ->orWhere('name', 'like', "%{$term}%"));
                    });
                })
                ->orderBy($sort, $direction)
                ->orderBy('id', $direction)
                ->get()
        );
    }

    public function show(Request $request, TherapistPricingRule $therapistPricingRule): AdminPricingRuleResource
    {
        $this->authorizeAdmin($request->user());

        $therapistPricingRule = $this->loadAdminPricingRule($therapistPricingRule);

        $this->recordAdminAudit(
            $request,
            'pricing_rule.view',
            $therapistPricingRule,
            [],
            $this->snapshot($therapistPricingRule)
        );

        return new AdminPricingRuleResource($therapistPricingRule);
    }

    public function note(Request $request, TherapistPricingRule $therapistPricingRule): AdminPricingRuleResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);

        $validated = $request->validate([
            'note' => ['required', 'string', 'max:2000'],
        ]);
        $before = $this->snapshot($therapistPricingRule);

        $therapistPricingRule->adminNotes()->create([
            'author_account_id' => $admin->id,
            'note_encrypted' => Crypt::encryptString($validated['note']),
        ]);

        $this->recordAdminAudit(
            $request,
            'pricing_rule.note',
            $therapistPricingRule,
            $before,
            $this->snapshot($therapistPricingRule->fresh())
        );

        return new AdminPricingRuleResource($this->loadAdminPricingRule($therapistPricingRule->fresh()));
    }

    public function monitor(Request $request, TherapistPricingRule $therapistPricingRule): AdminPricingRuleResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);

        $validated = $request->validate([
            'monitoring_status' => ['required', Rule::in(TherapistPricingRule::supportedMonitoringStatuses())],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);
        $before = $this->snapshot($therapistPricingRule);

        $therapistPricingRule->forceFill([
            'monitoring_status' => $validated['monitoring_status'],
            'monitored_by_admin_account_id' => $admin->id,
            'monitored_at' => now(),
        ])->save();

        if (filled($validated['note'] ?? null)) {
            $therapistPricingRule->adminNotes()->create([
                'author_account_id' => $admin->id,
                'note_encrypted' => Crypt::encryptString($validated['note']),
            ]);
        }

        $this->recordAdminAudit(
            $request,
            'pricing_rule.monitor',
            $therapistPricingRule,
            $before,
            $this->snapshot($therapistPricingRule->fresh())
        );

        return new AdminPricingRuleResource($this->loadAdminPricingRule($therapistPricingRule->fresh()));
    }

    private function loadAdminPricingRule(TherapistPricingRule $rule): TherapistPricingRule
    {
        return $rule->load(['therapistProfile.account', 'therapistMenu', 'monitoredByAdmin', 'adminNotes.author'])
            ->loadCount('adminNotes');
    }

    private function resolveTherapistMenuId(?string $publicId): ?int
    {
        if (! filled($publicId)) {
            return null;
        }

        $id = TherapistMenu::query()
            ->where('public_id', $publicId)
            ->value('id');

        abort_unless($id, 404);

        return (int) $id;
    }

    private function snapshot(TherapistPricingRule $rule): array
    {
        return [
            'id' => $rule->id,
            'therapist_profile_id' => $rule->therapist_profile_id,
            'therapist_menu_id' => $rule->therapist_menu_id,
            'rule_type' => $rule->rule_type,
            'adjustment_bucket' => TherapistPricingRule::adjustmentBucketFor($rule->rule_type),
            'condition_json' => $rule->condition_json,
            'adjustment_type' => $rule->adjustment_type,
            'adjustment_amount' => $rule->adjustment_amount,
            'min_price_amount' => $rule->min_price_amount,
            'max_price_amount' => $rule->max_price_amount,
            'priority' => $rule->priority,
            'is_active' => $rule->is_active,
            'monitoring_status' => $rule->monitoring_status,
            'monitored_by_admin_account_id' => $rule->monitored_by_admin_account_id,
            'monitored_at' => $rule->monitored_at,
            'admin_note_count' => AdminNote::query()
                ->where('target_type', TherapistPricingRule::class)
                ->where('target_id', $rule->id)
                ->count(),
        ];
    }
}
