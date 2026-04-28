<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BookingConsentResource;
use App\Http\Resources\BookingHealthCheckResource;
use App\Http\Resources\BookingResource;
use App\Http\Resources\ReportResource;
use App\Models\Account;
use App\Models\Booking;
use App\Models\BookingConsent;
use App\Models\BookingHealthCheck;
use App\Models\LegalDocument;
use App\Models\PaymentIntent;
use App\Models\Report;
use App\Services\Bookings\BookingCancellationSettlementService;
use App\Services\Notifications\AdminNotificationService;
use App\Services\Notifications\BookingNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class BookingSafetyController extends Controller
{
    private const CONSENT_ALLOWED_STATUSES = [
        Booking::STATUS_REQUESTED,
        Booking::STATUS_ACCEPTED,
        Booking::STATUS_MOVING,
        Booking::STATUS_ARRIVED,
        Booking::STATUS_IN_PROGRESS,
        Booking::STATUS_THERAPIST_COMPLETED,
        Booking::STATUS_COMPLETED,
        Booking::STATUS_INTERRUPTED,
    ];

    private const HEALTH_CHECK_ALLOWED_STATUSES = [
        Booking::STATUS_REQUESTED,
        Booking::STATUS_ACCEPTED,
        Booking::STATUS_MOVING,
        Booking::STATUS_ARRIVED,
        Booking::STATUS_IN_PROGRESS,
    ];

    private const INTERRUPT_ALLOWED_STATUSES = [
        Booking::STATUS_ACCEPTED,
        Booking::STATUS_MOVING,
        Booking::STATUS_ARRIVED,
        Booking::STATUS_IN_PROGRESS,
    ];

    private const NO_SHOW_REASON_CODES = [
        'user_no_show',
        'therapist_no_show',
    ];

    public function consent(Request $request, Booking $booking): BookingConsentResource
    {
        $actor = $this->authorizeParticipant($request, $booking);

        abort_unless(
            in_array($booking->status, self::CONSENT_ALLOWED_STATUSES, true),
            409,
            'この予約は、現在の状態では同意記録を登録できません。'
        );

        $validated = $request->validate([
            'consent_type' => ['required', 'string', 'max:100'],
            'legal_document_id' => ['nullable', 'string', 'max:36'],
        ]);

        $legalDocument = filled($validated['legal_document_id'] ?? null)
            ? LegalDocument::query()
                ->where('public_id', $validated['legal_document_id'])
                ->whereNotNull('published_at')
                ->firstOrFail()
            : null;

        $consent = BookingConsent::updateOrCreate(
            [
                'booking_id' => $booking->id,
                'account_id' => $actor->id,
                'consent_type' => $validated['consent_type'],
            ],
            [
                'legal_document_id' => $legalDocument?->id,
                'consented_at' => now(),
                'ip_hash' => filled($request->ip())
                    ? hash('sha256', (string) $request->ip())
                    : null,
            ],
        );

        return new BookingConsentResource($consent->load(['booking', 'account', 'legalDocument']));
    }

    public function healthCheck(Request $request, Booking $booking): BookingHealthCheckResource
    {
        $actor = $this->authorizeParticipant($request, $booking);
        $actorRole = $this->actorRole($booking, $actor);

        abort_unless(
            in_array($booking->status, self::HEALTH_CHECK_ALLOWED_STATUSES, true),
            409,
            'この予約は、現在の状態では体調確認を登録できません。'
        );

        $validated = $request->validate([
            'drinking_status' => ['nullable', Rule::in(['none', 'light', 'heavy', 'unknown'])],
            'has_injury' => ['nullable', 'boolean'],
            'has_fever' => ['nullable', 'boolean'],
            'contraindications' => ['nullable', 'array', 'max:20'],
            'contraindications.*' => ['string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $healthCheck = BookingHealthCheck::updateOrCreate(
            [
                'booking_id' => $booking->id,
                'account_id' => $actor->id,
                'role' => $actorRole,
            ],
            [
                'drinking_status' => $validated['drinking_status'] ?? null,
                'has_injury' => $validated['has_injury'] ?? null,
                'has_fever' => $validated['has_fever'] ?? null,
                'contraindications_json' => $validated['contraindications'] ?? [],
                'notes_encrypted' => filled($validated['notes'] ?? null)
                    ? Crypt::encryptString($validated['notes'])
                    : null,
                'checked_at' => now(),
            ],
        );

        return new BookingHealthCheckResource($healthCheck->load(['booking', 'account']));
    }

    public function interrupt(
        Request $request,
        Booking $booking,
        BookingCancellationSettlementService $settlementService,
        AdminNotificationService $adminNotificationService,
        BookingNotificationService $bookingNotificationService,
    ): JsonResponse {
        $actor = $this->authorizeParticipant($request, $booking);
        $actorRole = $this->actorRole($booking, $actor);

        abort_unless(
            in_array($booking->status, self::INTERRUPT_ALLOWED_STATUSES, true),
            409,
            'この予約は、現在の状態では中断できません。'
        );

        $validated = $request->validate([
            'reason_code' => ['required', 'string', 'max:100'],
            'reason_note' => ['nullable', 'string', 'max:1000'],
            'responsibility' => ['required', Rule::in(['user', 'therapist', 'shared', 'force_majeure', 'unknown'])],
            'severity' => ['nullable', Rule::in([
                Report::SEVERITY_LOW,
                Report::SEVERITY_MEDIUM,
                Report::SEVERITY_HIGH,
                Report::SEVERITY_CRITICAL,
            ])],
        ]);

        if (
            $actorRole === 'therapist'
            && $validated['reason_code'] === 'user_no_show'
            && $validated['responsibility'] === 'user'
        ) {
            $pendingBooking = DB::transaction(function () use ($actor, $actorRole, $booking, $validated): Booking {
                $lockedBooking = Booking::query()
                    ->with('currentPaymentIntent')
                    ->whereKey($booking->id)
                    ->lockForUpdate()
                    ->firstOrFail();

                abort_unless(
                    in_array($lockedBooking->status, self::INTERRUPT_ALLOWED_STATUSES, true),
                    409,
                    'この予約は、現在の状態では未着申告できません。'
                );

                abort_if(
                    $lockedBooking->hasPendingNoShowReport(),
                    409,
                    'すでに利用者の確認待ちになっている未着申告があります。'
                );

                $plannedStartAt = $lockedBooking->scheduled_start_at ?? $lockedBooking->requested_start_at;

                if ($plannedStartAt && $plannedStartAt->isFuture()) {
                    abort(422, '予定時刻になるまでは、この操作はまだ行えません。');
                }

                $lockedBooking->forceFill([
                    'pending_no_show_reported_at' => now(),
                    'pending_no_show_reported_by_account_id' => $actor->id,
                    'pending_no_show_reason_code' => $validated['reason_code'],
                    'pending_no_show_note_encrypted' => filled($validated['reason_note'] ?? null)
                        ? Crypt::encryptString($validated['reason_note'])
                        : null,
                ])->save();

                $lockedBooking->statusLogs()->create([
                    'from_status' => $lockedBooking->status,
                    'to_status' => $lockedBooking->status,
                    'actor_account_id' => $actor->id,
                    'actor_role' => $actorRole,
                    'reason_code' => 'therapist_reported_user_no_show',
                    'metadata_json' => [
                        'reason_note' => $validated['reason_note'] ?? null,
                        'responsibility' => $validated['responsibility'],
                    ],
                ]);

                return $this->loadParticipantBooking($lockedBooking->refresh());
            });

            $bookingNotificationService->notifyNoShowReported($pendingBooking->fresh());

            return response()->json([
                'data' => [
                    'booking' => (new BookingResource($this->loadParticipantBooking($pendingBooking->fresh())))->resolve($request),
                    'interruption' => [
                        'reason_code' => $validated['reason_code'],
                        'reason_note' => $validated['reason_note'] ?? null,
                        'responsibility' => $validated['responsibility'],
                        'payment_action' => 'awaiting_user_confirmation',
                        'pending_user_confirmation' => true,
                    ],
                ],
            ]);
        }

        [$interruptedBooking, $report, $settlement] = DB::transaction(function () use (
            $actor,
            $actorRole,
            $booking,
            $validated
        ): array {
            $lockedBooking = Booking::query()
                ->with('currentPaymentIntent')
                ->whereKey($booking->id)
                ->lockForUpdate()
                ->firstOrFail();

            abort_unless(
                in_array($lockedBooking->status, self::INTERRUPT_ALLOWED_STATUSES, true),
                409,
                'この予約は、現在の状態では中断できません。'
            );

            abort_if(
                $lockedBooking->hasPendingNoShowReport(),
                409,
                '利用者の確認待ちになっている未着申告があります。先にその返答を確認してください。'
            );

            if (in_array($validated['reason_code'], self::NO_SHOW_REASON_CODES, true)) {
                $plannedStartAt = $lockedBooking->scheduled_start_at ?? $lockedBooking->requested_start_at;

                if ($plannedStartAt && $plannedStartAt->isFuture()) {
                    abort(422, '予定時刻になるまでは、この操作はまだ行えません。');
                }
            }

            $fromStatus = $lockedBooking->status;

            $lockedBooking->forceFill([
                'status' => Booking::STATUS_INTERRUPTED,
                'request_expires_at' => null,
                'interrupted_at' => now(),
                'canceled_by_account_id' => $actor->id,
                'cancel_reason_code' => $validated['reason_code'],
                'interruption_reason_code' => $validated['reason_code'],
                'cancel_reason_note_encrypted' => filled($validated['reason_note'] ?? null)
                    ? Crypt::encryptString($validated['reason_note'])
                    : null,
            ])->save();

            $lockedBooking->statusLogs()->create([
                'from_status' => $fromStatus,
                'to_status' => Booking::STATUS_INTERRUPTED,
                'actor_account_id' => $actor->id,
                'actor_role' => $actorRole,
                'reason_code' => $validated['reason_code'],
                'metadata_json' => [
                    'reason_note' => $validated['reason_note'] ?? null,
                    'responsibility' => $validated['responsibility'],
                ],
            ]);

            $report = Report::create([
                'public_id' => 'rep_'.Str::ulid(),
                'booking_id' => $lockedBooking->id,
                'reporter_account_id' => $actor->id,
                'target_account_id' => $actorRole === 'user'
                    ? $lockedBooking->therapist_account_id
                    : $lockedBooking->user_account_id,
                'category' => 'booking_interrupted',
                'severity' => $validated['severity'] ?? Report::SEVERITY_HIGH,
                'detail_encrypted' => filled($validated['reason_note'] ?? null)
                    ? Crypt::encryptString($validated['reason_note'])
                    : null,
                'status' => Report::STATUS_OPEN,
            ]);

            $report->actions()->create([
                'action_type' => 'report_created',
                'metadata_json' => [
                    'source' => 'booking_interrupt_api',
                    'reason_code' => $validated['reason_code'],
                    'responsibility' => $validated['responsibility'],
                ],
                'created_at' => now(),
            ]);

            return [
                $this->loadParticipantBooking($lockedBooking->refresh()),
                $report->load(['booking', 'reporter', 'target']),
                $this->interruptionSettlement($lockedBooking->refresh()->load('currentPaymentIntent'), $validated['responsibility']),
            ];
        });

        $settlementService->settle($interruptedBooking, $settlement);
        $adminNotificationService->notifyReportCreated($report);
        $bookingNotificationService->notifyInterrupted(
            $this->loadParticipantBooking($interruptedBooking->fresh()),
            responsibility: $validated['responsibility'],
            interruptedByRole: $actorRole,
            reasonCode: $validated['reason_code'],
            reasonNote: $validated['reason_note'] ?? null,
        );

        return response()->json([
            'data' => [
                'booking' => (new BookingResource($this->loadParticipantBooking($interruptedBooking->fresh())))->resolve($request),
                'report' => (new ReportResource($report))->resolve($request),
                'interruption' => [
                    'reason_code' => $validated['reason_code'],
                    'reason_note' => $validated['reason_note'] ?? null,
                    'responsibility' => $validated['responsibility'],
                    'payment_action' => $settlement['payment_action'],
                ],
            ],
        ]);
    }

    public function confirmPendingNoShow(
        Request $request,
        Booking $booking,
        BookingCancellationSettlementService $settlementService,
        BookingNotificationService $bookingNotificationService,
    ): JsonResponse {
        $actor = $this->authorizeParticipant($request, $booking);
        $actorRole = $this->actorRole($booking, $actor);

        abort_unless($actorRole === 'user', 404);

        [$interruptedBooking, $report, $settlement] = DB::transaction(function () use ($actor, $booking): array {
            $lockedBooking = Booking::query()
                ->with('currentPaymentIntent')
                ->whereKey($booking->id)
                ->lockForUpdate()
                ->firstOrFail();

            abort_unless(
                $lockedBooking->hasPendingTherapistNoShowReport(),
                409,
                '確認できる未着申告がありません。'
            );

            $reasonNote = $lockedBooking->pending_no_show_note_encrypted
                ? rescue(fn () => Crypt::decryptString($lockedBooking->pending_no_show_note_encrypted), null, false)
                : null;

            $reportedByAccountId = $lockedBooking->pending_no_show_reported_by_account_id;
            $reasonCode = (string) $lockedBooking->pending_no_show_reason_code;
            $fromStatus = $lockedBooking->status;

            $lockedBooking->forceFill([
                'status' => Booking::STATUS_INTERRUPTED,
                'request_expires_at' => null,
                'interrupted_at' => now(),
                'canceled_by_account_id' => $reportedByAccountId,
                'cancel_reason_code' => $reasonCode,
                'interruption_reason_code' => $reasonCode,
                'cancel_reason_note_encrypted' => $lockedBooking->pending_no_show_note_encrypted,
                ...$lockedBooking->clearPendingNoShowReportAttributes(),
            ])->save();

            $lockedBooking->statusLogs()->create([
                'from_status' => $fromStatus,
                'to_status' => Booking::STATUS_INTERRUPTED,
                'actor_account_id' => $actor->id,
                'actor_role' => 'user',
                'reason_code' => 'user_confirmed_no_show',
                'metadata_json' => [
                    'reported_by_role' => 'therapist',
                    'responsibility' => 'user',
                    'reason_note' => $reasonNote,
                ],
            ]);

            $report = $this->createInterruptionReport(
                booking: $lockedBooking,
                reporterAccountId: $reportedByAccountId,
                targetAccountId: $lockedBooking->user_account_id,
                detail: $reasonNote,
                severity: Report::SEVERITY_HIGH,
                status: Report::STATUS_RESOLVED,
                metadata: [
                    'source' => 'booking_no_show_confirm_api',
                    'reason_code' => $reasonCode,
                    'responsibility' => 'user',
                ],
            );

            return [
                $this->loadParticipantBooking($lockedBooking->refresh()),
                $report->load(['booking', 'reporter', 'target']),
                $this->interruptionSettlement($lockedBooking->refresh()->load('currentPaymentIntent'), 'user'),
            ];
        });

        $settlementService->settle($interruptedBooking, $settlement);
        $bookingNotificationService->notifyNoShowConfirmed($interruptedBooking->refresh());

        return response()->json([
            'data' => [
                'booking' => (new BookingResource($this->loadParticipantBooking($interruptedBooking->fresh())))->resolve($request),
                'report' => (new ReportResource($report))->resolve($request),
                'interruption' => [
                    'reason_code' => $interruptedBooking->interruption_reason_code,
                    'reason_note' => $interruptedBooking->cancel_reason_note_encrypted
                        ? rescue(fn () => Crypt::decryptString($interruptedBooking->cancel_reason_note_encrypted), null, false)
                        : null,
                    'responsibility' => 'user',
                    'payment_action' => $settlement['payment_action'],
                ],
            ],
        ]);
    }

    public function disputePendingNoShow(
        Request $request,
        Booking $booking,
        BookingCancellationSettlementService $settlementService,
        AdminNotificationService $adminNotificationService,
        BookingNotificationService $bookingNotificationService,
    ): JsonResponse {
        $actor = $this->authorizeParticipant($request, $booking);
        $actorRole = $this->actorRole($booking, $actor);

        abort_unless($actorRole === 'user', 404);

        $validated = $request->validate([
            'reason_note' => ['required', 'string', 'min:1', 'max:1000'],
        ]);

        [$interruptedBooking, $report, $settlement] = DB::transaction(function () use ($actor, $booking, $validated): array {
            $lockedBooking = Booking::query()
                ->with('currentPaymentIntent')
                ->whereKey($booking->id)
                ->lockForUpdate()
                ->firstOrFail();

            abort_unless(
                $lockedBooking->hasPendingTherapistNoShowReport(),
                409,
                '異議を申し立てられる未着申告がありません。'
            );

            $pendingReasonNote = $lockedBooking->pending_no_show_note_encrypted
                ? rescue(fn () => Crypt::decryptString($lockedBooking->pending_no_show_note_encrypted), null, false)
                : null;
            $reasonCode = (string) $lockedBooking->pending_no_show_reason_code;
            $fromStatus = $lockedBooking->status;
            $combinedReasonNote = trim(implode("\n", array_filter([
                $pendingReasonNote ? "タチキャスト申告: {$pendingReasonNote}" : null,
                '利用者回答: '.$validated['reason_note'],
            ])));

            $lockedBooking->forceFill([
                'status' => Booking::STATUS_INTERRUPTED,
                'request_expires_at' => null,
                'interrupted_at' => now(),
                'canceled_by_account_id' => $actor->id,
                'cancel_reason_code' => 'user_no_show_disputed',
                'interruption_reason_code' => 'user_no_show_disputed',
                'cancel_reason_note_encrypted' => Crypt::encryptString($combinedReasonNote),
                ...$lockedBooking->clearPendingNoShowReportAttributes(),
            ])->save();

            $lockedBooking->statusLogs()->create([
                'from_status' => $fromStatus,
                'to_status' => Booking::STATUS_INTERRUPTED,
                'actor_account_id' => $actor->id,
                'actor_role' => 'user',
                'reason_code' => 'user_disputed_no_show',
                'metadata_json' => [
                    'reported_by_role' => 'therapist',
                    'responsibility' => 'unknown',
                    'reason_note' => $combinedReasonNote,
                ],
            ]);

            $report = $this->createInterruptionReport(
                booking: $lockedBooking,
                reporterAccountId: $actor->id,
                targetAccountId: $lockedBooking->therapist_account_id,
                detail: $combinedReasonNote,
                severity: Report::SEVERITY_HIGH,
                status: Report::STATUS_OPEN,
                metadata: [
                    'source' => 'booking_no_show_dispute_api',
                    'reason_code' => $reasonCode,
                    'responsibility' => 'unknown',
                ],
            );

            return [
                $this->loadParticipantBooking($lockedBooking->refresh()),
                $report->load(['booking', 'reporter', 'target']),
                $this->interruptionSettlement($lockedBooking->refresh()->load('currentPaymentIntent'), 'unknown'),
            ];
        });

        $settlementService->settle($interruptedBooking, $settlement);
        $adminNotificationService->notifyReportCreated($report);
        $bookingNotificationService->notifyNoShowDisputed($interruptedBooking->refresh());

        return response()->json([
            'data' => [
                'booking' => (new BookingResource($this->loadParticipantBooking($interruptedBooking->fresh())))->resolve($request),
                'report' => (new ReportResource($report))->resolve($request),
                'interruption' => [
                    'reason_code' => $interruptedBooking->interruption_reason_code,
                    'reason_note' => $interruptedBooking->cancel_reason_note_encrypted
                        ? rescue(fn () => Crypt::decryptString($interruptedBooking->cancel_reason_note_encrypted), null, false)
                        : null,
                    'responsibility' => 'unknown',
                    'payment_action' => $settlement['payment_action'],
                ],
            ],
        ]);
    }

    private function interruptionSettlement(Booking $booking, string $responsibility): array
    {
        if ($responsibility === 'user') {
            return [
                'payment_action' => 'capture_full_amount',
                'refund_amount' => 0,
                'policy_code' => 'interruption_user_fault',
            ];
        }

        $paymentIntentStatus = $booking->currentPaymentIntent?->status;

        return [
            'payment_action' => $paymentIntentStatus === PaymentIntent::STRIPE_STATUS_SUCCEEDED
                ? 'capture_cancel_fee_and_refund_remaining'
                : 'void_authorization',
            'refund_amount' => $booking->total_amount,
            'policy_code' => 'interruption_full_refund',
        ];
    }

    private function createInterruptionReport(
        Booking $booking,
        int $reporterAccountId,
        int $targetAccountId,
        ?string $detail,
        string $severity,
        string $status,
        array $metadata,
    ): Report {
        $report = Report::create([
            'public_id' => 'rep_'.Str::ulid(),
            'booking_id' => $booking->id,
            'reporter_account_id' => $reporterAccountId,
            'target_account_id' => $targetAccountId,
            'category' => 'booking_interrupted',
            'severity' => $severity,
            'detail_encrypted' => filled($detail)
                ? Crypt::encryptString($detail)
                : null,
            'status' => $status,
            'resolved_at' => $status === Report::STATUS_RESOLVED ? now() : null,
        ]);

        $report->actions()->create([
            'action_type' => 'report_created',
            'metadata_json' => $metadata,
            'created_at' => now(),
        ]);

        return $report;
    }

    private function authorizeParticipant(Request $request, Booking $booking): Account
    {
        $actor = $request->user();

        abort_unless(
            $booking->user_account_id === $actor->id || $booking->therapist_account_id === $actor->id,
            404
        );

        return $actor;
    }

    private function actorRole(Booking $booking, Account $actor): string
    {
        return $booking->user_account_id === $actor->id ? 'user' : 'therapist';
    }

    private function loadParticipantBooking(Booking $booking): Booking
    {
        return $booking->load([
            'currentQuote',
            'currentPaymentIntent',
            'canceledBy',
            'refunds' => fn ($query) => $query->latest('id'),
            'consents' => fn ($query) => $query->with(['account', 'legalDocument'])->orderBy('id'),
            'healthChecks' => fn ($query) => $query->with('account')->latest('id'),
        ]);
    }
}
