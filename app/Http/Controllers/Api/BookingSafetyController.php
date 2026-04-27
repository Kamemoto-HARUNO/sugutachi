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
