<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ReportResource;
use App\Models\Account;
use App\Models\Booking;
use App\Models\Report;
use App\Services\Notifications\AdminNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ReportController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $validated = $request->validate([
            'booking_id' => ['nullable', 'string', 'max:36'],
            'target_account_id' => ['nullable', 'string', 'max:36'],
            'status' => ['nullable', Rule::in([Report::STATUS_OPEN, Report::STATUS_RESOLVED])],
            'category' => ['nullable', 'string', 'max:100'],
            'severity' => ['nullable', Rule::in([
                Report::SEVERITY_LOW,
                Report::SEVERITY_MEDIUM,
                Report::SEVERITY_HIGH,
                Report::SEVERITY_CRITICAL,
            ])],
            'sort' => ['nullable', Rule::in(['created_at', 'resolved_at'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
        ]);

        $actor = $request->user();
        $sort = $validated['sort'] ?? 'created_at';
        $direction = $validated['direction'] ?? 'desc';

        $reports = Report::query()
            ->with(['booking', 'sourceBookingMessage.sender', 'reporter', 'target'])
            ->where('reporter_account_id', $actor->id)
            ->when(
                $validated['booking_id'] ?? null,
                fn ($query, string $bookingPublicId) => $query->whereHas(
                    'booking',
                    fn ($bookingQuery) => $bookingQuery->where('public_id', $bookingPublicId)
                )
            )
            ->when(
                $validated['target_account_id'] ?? null,
                fn ($query, string $targetPublicId) => $query->whereHas(
                    'target',
                    fn ($targetQuery) => $targetQuery->where('public_id', $targetPublicId)
                )
            )
            ->when($validated['status'] ?? null, fn ($query, string $status) => $query->where('status', $status))
            ->when($validated['category'] ?? null, fn ($query, string $category) => $query->where('category', $category))
            ->when($validated['severity'] ?? null, fn ($query, string $severity) => $query->where('severity', $severity))
            ->orderBy($sort, $direction)
            ->orderBy('id', $direction)
            ->get();

        return ReportResource::collection($reports)->additional([
            'meta' => [
                'total_count' => Report::query()
                    ->where('reporter_account_id', $actor->id)
                    ->count(),
                'open_count' => Report::query()
                    ->where('reporter_account_id', $actor->id)
                    ->where('status', Report::STATUS_OPEN)
                    ->count(),
                'resolved_count' => Report::query()
                    ->where('reporter_account_id', $actor->id)
                    ->where('status', Report::STATUS_RESOLVED)
                    ->count(),
                'filters' => [
                    'booking_id' => $validated['booking_id'] ?? null,
                    'target_account_id' => $validated['target_account_id'] ?? null,
                    'status' => $validated['status'] ?? null,
                    'category' => $validated['category'] ?? null,
                    'severity' => $validated['severity'] ?? null,
                    'sort' => $sort,
                    'direction' => $direction,
                ],
            ],
        ]);
    }

    public function store(Request $request, AdminNotificationService $adminNotificationService): JsonResponse
    {
        $validated = $request->validate([
            'booking_id' => ['nullable', 'string', 'max:36'],
            'target_account_id' => ['nullable', 'string', 'max:36'],
            'category' => ['required', 'string', 'max:100'],
            'severity' => ['nullable', 'string', 'in:low,medium,high,critical'],
            'detail' => ['nullable', 'string', 'max:2000'],
        ]);

        $booking = filled($validated['booking_id'] ?? null)
            ? Booking::query()->where('public_id', $validated['booking_id'])->firstOrFail()
            : null;
        $target = filled($validated['target_account_id'] ?? null)
            ? Account::query()->where('public_id', $validated['target_account_id'])->firstOrFail()
            : null;

        if ($booking) {
            $this->authorizeBookingParticipant($booking, $request->user());
            $this->assertReportTargetBelongsToBooking($booking, $target);
        }

        abort_if($target && $target->id === $request->user()->id, 422, '自分自身を通報することはできません。');

        $report = Report::create([
            'public_id' => 'rep_'.Str::ulid(),
            'booking_id' => $booking?->id,
            'reporter_account_id' => $request->user()->id,
            'target_account_id' => $target?->id,
            'category' => $validated['category'],
            'severity' => $validated['severity'] ?? Report::SEVERITY_MEDIUM,
            'detail_encrypted' => filled($validated['detail'] ?? null)
                ? Crypt::encryptString($validated['detail'])
                : null,
            'status' => Report::STATUS_OPEN,
        ]);

        $report->actions()->create([
            'action_type' => 'report_created',
            'metadata_json' => [
                'category' => $report->category,
                'severity' => $report->severity,
            ],
            'created_at' => now(),
        ]);

        $report = $report->load(['booking', 'sourceBookingMessage.sender', 'reporter', 'target']);
        $report->setAttribute('include_detail', true);
        $adminNotificationService->notifyReportCreated($report);

        return (new ReportResource($report))
            ->response()
            ->setStatusCode(201);
    }

    public function show(Request $request, Report $report): ReportResource
    {
        abort_unless($report->reporter_account_id === $request->user()->id, 404);

        $report = $report->load(['booking', 'sourceBookingMessage.sender', 'reporter', 'target']);
        $report->setAttribute('include_detail', true);

        return new ReportResource($report);
    }

    private function authorizeBookingParticipant(Booking $booking, Account $actor): void
    {
        abort_unless(
            $booking->user_account_id === $actor->id || $booking->therapist_account_id === $actor->id,
            404
        );
    }

    private function assertReportTargetBelongsToBooking(Booking $booking, ?Account $target): void
    {
        if (! $target) {
            return;
        }

        abort_unless(
            $target->id === $booking->user_account_id || $target->id === $booking->therapist_account_id,
            422,
            '指定した相手はこの予約の参加者ではありません。'
        );
    }
}
