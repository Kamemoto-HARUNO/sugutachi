<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ReportResource;
use App\Models\Account;
use App\Models\Booking;
use App\Models\Report;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;

class ReportController extends Controller
{
    public function store(Request $request): JsonResponse
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

        abort_if($target && $target->id === $request->user()->id, 422, 'You cannot report yourself.');

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

        return (new ReportResource($report->load(['booking', 'reporter', 'target'])))
            ->response()
            ->setStatusCode(201);
    }

    public function show(Request $request, Report $report): ReportResource
    {
        abort_unless($report->reporter_account_id === $request->user()->id, 404);

        return new ReportResource($report->load(['booking', 'reporter', 'target']));
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
            'The target account is not part of this booking.'
        );
    }
}
