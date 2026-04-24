<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Api\Concerns\RecordsAdminAuditLogs;
use App\Http\Controllers\Api\Concerns\ResolvesAdminFilterIds;
use App\Http\Controllers\Controller;
use App\Http\Resources\AdminReportResource;
use App\Http\Resources\ReportResource;
use App\Models\Report;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Validation\Rule;

class AdminReportController extends Controller
{
    use AuthorizesAdminRequests;
    use RecordsAdminAuditLogs;
    use ResolvesAdminFilterIds;

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorizeAdmin($request->user());

        $validated = $request->validate([
            'booking_id' => ['nullable', 'string', 'max:36'],
            'source_booking_message_id' => ['nullable', 'integer', 'min:1'],
            'reporter_account_id' => ['nullable', 'string', 'max:36'],
            'target_account_id' => ['nullable', 'string', 'max:36'],
            'assigned_admin_account_id' => ['nullable', 'string', 'max:36'],
            'status' => ['nullable', Rule::in([Report::STATUS_OPEN, Report::STATUS_RESOLVED])],
            'severity' => ['nullable', Rule::in([
                Report::SEVERITY_LOW,
                Report::SEVERITY_MEDIUM,
                Report::SEVERITY_HIGH,
                Report::SEVERITY_CRITICAL,
            ])],
            'sort' => ['nullable', Rule::in(['created_at', 'resolved_at'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
        ]);
        $bookingId = $this->resolveBookingId($validated['booking_id'] ?? null);
        $sourceBookingMessageId = $validated['source_booking_message_id'] ?? null;
        $reporterId = $this->resolveAccountId($validated['reporter_account_id'] ?? null);
        $targetId = $this->resolveAccountId($validated['target_account_id'] ?? null);
        $assignedAdminId = $this->resolveAccountId($validated['assigned_admin_account_id'] ?? null);
        $sort = $validated['sort'] ?? 'created_at';
        $direction = $validated['direction'] ?? 'desc';

        return ReportResource::collection(
            Report::query()
                ->with(['booking', 'sourceBookingMessage', 'reporter', 'target', 'assignedAdmin'])
                ->when($bookingId, fn ($query, int $id) => $query->where('booking_id', $id))
                ->when($sourceBookingMessageId, fn ($query, int $id) => $query->where('source_booking_message_id', $id))
                ->when($reporterId, fn ($query, int $id) => $query->where('reporter_account_id', $id))
                ->when($targetId, fn ($query, int $id) => $query->where('target_account_id', $id))
                ->when($assignedAdminId, fn ($query, int $id) => $query->where('assigned_admin_account_id', $id))
                ->when($validated['status'] ?? null, fn ($query, string $status) => $query->where('status', $status))
                ->when($validated['severity'] ?? null, fn ($query, string $severity) => $query->where('severity', $severity))
                ->orderBy($sort, $direction)
                ->orderBy('id', $direction)
                ->get()
        );
    }

    public function show(Request $request, Report $report): AdminReportResource
    {
        $this->authorizeAdmin($request->user());
        $report->load(['booking', 'sourceBookingMessage.sender', 'reporter', 'target', 'assignedAdmin', 'actions.admin']);

        $this->recordAdminAudit($request, 'report.view', $report, [], $this->snapshot($report));

        return new AdminReportResource($report);
    }

    public function action(Request $request, Report $report): AdminReportResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);

        $validated = $request->validate([
            'action_type' => ['required', 'string', 'max:100'],
            'note' => ['nullable', 'string', 'max:2000'],
            'metadata' => ['nullable', 'array'],
        ]);
        $before = $this->snapshot($report);

        $report->actions()->create([
            'admin_account_id' => $admin->id,
            'action_type' => $validated['action_type'],
            'note_encrypted' => filled($validated['note'] ?? null)
                ? Crypt::encryptString($validated['note'])
                : null,
            'metadata_json' => $validated['metadata'] ?? null,
            'created_at' => now(),
        ]);

        if (! $report->assigned_admin_account_id) {
            $report->forceFill(['assigned_admin_account_id' => $admin->id])->save();
        }

        $this->recordAdminAudit($request, 'report.action', $report, $before, $this->snapshot($report->refresh()));

        return new AdminReportResource($report->load([
            'booking',
            'sourceBookingMessage.sender',
            'reporter',
            'target',
            'assignedAdmin',
            'actions.admin',
        ]));
    }

    public function resolve(Request $request, Report $report): AdminReportResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        abort_unless($report->status === Report::STATUS_OPEN, 409, 'Only open reports can be resolved.');

        $validated = $request->validate([
            'resolution_note' => ['nullable', 'string', 'max:2000'],
            'metadata' => ['nullable', 'array'],
        ]);
        $before = $this->snapshot($report);

        $report->forceFill([
            'status' => Report::STATUS_RESOLVED,
            'assigned_admin_account_id' => $report->assigned_admin_account_id ?? $admin->id,
            'resolved_at' => now(),
        ])->save();

        $report->actions()->create([
            'admin_account_id' => $admin->id,
            'action_type' => 'report_resolved',
            'note_encrypted' => filled($validated['resolution_note'] ?? null)
                ? Crypt::encryptString($validated['resolution_note'])
                : null,
            'metadata_json' => $validated['metadata'] ?? null,
            'created_at' => now(),
        ]);

        $this->recordAdminAudit($request, 'report.resolve', $report, $before, $this->snapshot($report->refresh()));

        return new AdminReportResource($report->load([
            'booking',
            'sourceBookingMessage.sender',
            'reporter',
            'target',
            'assignedAdmin',
            'actions.admin',
        ]));
    }

    private function snapshot(Report $report): array
    {
        return $report->only([
            'id',
            'public_id',
            'booking_id',
            'source_booking_message_id',
            'reporter_account_id',
            'target_account_id',
            'category',
            'severity',
            'status',
            'assigned_admin_account_id',
            'resolved_at',
        ]);
    }
}
