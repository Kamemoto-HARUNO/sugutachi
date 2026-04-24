<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Api\Concerns\RecordsAdminAuditLogs;
use App\Http\Controllers\Api\Concerns\ResolvesAdminFilterIds;
use App\Http\Controllers\Api\Concerns\SuspendsAccounts;
use App\Http\Controllers\Controller;
use App\Http\Resources\AdminAccountResource;
use App\Http\Resources\AdminBookingDetailResource;
use App\Http\Resources\AdminBookingListResource;
use App\Http\Resources\AdminBookingMessageResource;
use App\Http\Resources\AdminReportResource;
use App\Models\Account;
use App\Models\Booking;
use App\Models\BookingMessage;
use App\Models\Refund;
use App\Models\Report;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminBookingController extends Controller
{
    use AuthorizesAdminRequests;
    use RecordsAdminAuditLogs;
    use ResolvesAdminFilterIds;
    use SuspendsAccounts;

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorizeAdmin($request->user());

        $validated = $request->validate([
            'user_account_id' => ['nullable', 'string', 'max:36'],
            'therapist_account_id' => ['nullable', 'string', 'max:36'],
            'therapist_profile_id' => ['nullable', 'string', 'max:36'],
            'status' => ['nullable', Rule::in($this->bookingStatuses())],
            'cancel_reason_code' => ['nullable', 'string', 'max:100'],
            'interruption_reason_code' => ['nullable', 'string', 'max:100'],
            'is_on_demand' => ['nullable', 'boolean'],
            'payment_intent_status' => ['nullable', 'string', 'max:50'],
            'has_refund_request' => ['nullable', 'boolean'],
            'has_auto_refund' => ['nullable', 'boolean'],
            'has_open_report' => ['nullable', 'boolean'],
            'has_interruption_report' => ['nullable', 'boolean'],
            'has_consent' => ['nullable', 'boolean'],
            'has_health_check' => ['nullable', 'boolean'],
            'has_open_dispute' => ['nullable', 'boolean'],
            'has_flagged_message' => ['nullable', 'boolean'],
            'scheduled_from' => ['nullable', 'date'],
            'scheduled_to' => ['nullable', 'date'],
            'completed_on' => ['nullable', 'date'],
            'request_expires_from' => ['nullable', 'date'],
            'request_expires_to' => ['nullable', 'date'],
            'q' => ['nullable', 'string', 'max:100'],
            'sort' => ['nullable', Rule::in(['created_at', 'updated_at', 'scheduled_start_at', 'total_amount'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
        ]);
        $userAccountId = $this->resolveAccountId($validated['user_account_id'] ?? null);
        $therapistAccountId = $this->resolveAccountId($validated['therapist_account_id'] ?? null);
        $therapistProfileId = $this->resolveTherapistProfileId($validated['therapist_profile_id'] ?? null);
        $sort = $validated['sort'] ?? 'created_at';
        $direction = $validated['direction'] ?? 'desc';

        return AdminBookingListResource::collection(
            Booking::query()
                ->with([
                    'userAccount',
                    'therapistAccount',
                    'therapistProfile',
                    'therapistMenu',
                    'serviceAddress',
                    'canceledBy',
                    'currentPaymentIntent',
                ])
                ->withCount([
                    'refunds',
                    'refunds as auto_refunds_count' => fn ($query) => $query
                        ->where('reason_code', Refund::REASON_CODE_BOOKING_CANCELLATION_AUTO),
                    'reports',
                    'reports as interruption_reports_count' => fn ($query) => $query
                        ->where('category', 'booking_interrupted'),
                    'consents',
                    'healthChecks',
                    'disputes as open_disputes_count' => fn ($query) => $query->whereIn('status', [
                        'needs_response',
                        'under_review',
                    ]),
                    'messages as flagged_messages_count' => fn ($query) => $query->flagged(),
                ])
                ->when($userAccountId, fn ($query, int $id) => $query->where('user_account_id', $id))
                ->when($therapistAccountId, fn ($query, int $id) => $query->where('therapist_account_id', $id))
                ->when($therapistProfileId, fn ($query, int $id) => $query->where('therapist_profile_id', $id))
                ->when($validated['status'] ?? null, fn ($query, string $status) => $query->where('status', $status))
                ->when($validated['cancel_reason_code'] ?? null, fn ($query, string $code) => $query->where('cancel_reason_code', $code))
                ->when(
                    $validated['interruption_reason_code'] ?? null,
                    fn ($query, string $code) => $query->where('interruption_reason_code', $code)
                )
                ->when(
                    array_key_exists('is_on_demand', $validated),
                    fn ($query) => $query->where('is_on_demand', (bool) $validated['is_on_demand'])
                )
                ->when(
                    $validated['payment_intent_status'] ?? null,
                    fn ($query, string $status) => $query->whereHas('currentPaymentIntent', fn ($query) => $query->where('status', $status))
                )
                ->when(
                    array_key_exists('has_refund_request', $validated),
                    fn ($query) => $validated['has_refund_request']
                        ? $query->whereHas('refunds')
                        : $query->whereDoesntHave('refunds')
                )
                ->when(
                    array_key_exists('has_auto_refund', $validated),
                    fn ($query) => $validated['has_auto_refund']
                        ? $query->whereHas('refunds', fn ($query) => $query
                            ->where('reason_code', Refund::REASON_CODE_BOOKING_CANCELLATION_AUTO))
                        : $query->whereDoesntHave('refunds', fn ($query) => $query
                            ->where('reason_code', Refund::REASON_CODE_BOOKING_CANCELLATION_AUTO))
                )
                ->when(
                    array_key_exists('has_open_report', $validated),
                    fn ($query) => $validated['has_open_report']
                        ? $query->whereHas('reports', fn ($query) => $query->where('status', 'open'))
                        : $query->whereDoesntHave('reports', fn ($query) => $query->where('status', 'open'))
                )
                ->when(
                    array_key_exists('has_interruption_report', $validated),
                    fn ($query) => $validated['has_interruption_report']
                        ? $query->whereHas('reports', fn ($query) => $query->where('category', 'booking_interrupted'))
                        : $query->whereDoesntHave('reports', fn ($query) => $query->where('category', 'booking_interrupted'))
                )
                ->when(
                    array_key_exists('has_consent', $validated),
                    fn ($query) => $validated['has_consent']
                        ? $query->whereHas('consents')
                        : $query->whereDoesntHave('consents')
                )
                ->when(
                    array_key_exists('has_health_check', $validated),
                    fn ($query) => $validated['has_health_check']
                        ? $query->whereHas('healthChecks')
                        : $query->whereDoesntHave('healthChecks')
                )
                ->when(
                    array_key_exists('has_open_dispute', $validated),
                    fn ($query) => $validated['has_open_dispute']
                        ? $query->whereHas('disputes', fn ($query) => $query->whereIn('status', ['needs_response', 'under_review']))
                        : $query->whereDoesntHave('disputes', fn ($query) => $query->whereIn('status', ['needs_response', 'under_review']))
                )
                ->when(
                    array_key_exists('has_flagged_message', $validated),
                    fn ($query) => $validated['has_flagged_message']
                        ? $query->whereHas('messages', fn ($query) => $query->flagged())
                        : $query->whereDoesntHave('messages', fn ($query) => $query->flagged())
                )
                ->when($validated['scheduled_from'] ?? null, fn ($query, string $date) => $query->whereDate('scheduled_start_at', '>=', $date))
                ->when($validated['scheduled_to'] ?? null, fn ($query, string $date) => $query->whereDate('scheduled_start_at', '<=', $date))
                ->when($validated['completed_on'] ?? null, fn ($query, string $date) => $query
                    ->where('status', Booking::STATUS_COMPLETED)
                    ->whereDate('updated_at', $date))
                ->when($validated['request_expires_from'] ?? null, fn ($query, string $date) => $query->whereDate('request_expires_at', '>=', $date))
                ->when($validated['request_expires_to'] ?? null, fn ($query, string $date) => $query->whereDate('request_expires_at', '<=', $date))
                ->when($validated['q'] ?? null, function ($query, string $term): void {
                    $query->where(function ($query) use ($term): void {
                        $query
                            ->where('public_id', $term)
                            ->orWhereHas('userAccount', fn ($query) => $query
                                ->where('public_id', $term)
                                ->orWhere('email', 'like', "%{$term}%")
                                ->orWhere('display_name', 'like', "%{$term}%"))
                            ->orWhereHas('therapistAccount', fn ($query) => $query
                                ->where('public_id', $term)
                                ->orWhere('email', 'like', "%{$term}%")
                                ->orWhere('display_name', 'like', "%{$term}%"));
                    });
                })
                ->orderBy($sort, $direction)
                ->orderBy('id', $direction)
                ->get()
        );
    }

    public function show(Request $request, Booking $booking): AdminBookingDetailResource
    {
        $this->authorizeAdmin($request->user());

        $booking->load([
            'userAccount',
            'therapistAccount',
            'therapistProfile',
            'therapistMenu',
            'serviceAddress',
            'canceledBy',
            'currentQuote',
            'currentPaymentIntent',
            'refunds.booking',
            'refunds.requestedBy',
            'refunds.reviewedBy',
            'reports.booking',
            'reports.reporter',
            'reports.target',
            'reports.assignedAdmin',
            'consents' => fn ($query) => $query->with(['booking', 'account', 'legalDocument'])->orderBy('id'),
            'healthChecks' => fn ($query) => $query->with(['booking', 'account'])->latest('id'),
            'statusLogs.actor',
        ]);

        $this->recordAdminAudit($request, 'booking.view', $booking, [], $this->snapshot($booking));

        return new AdminBookingDetailResource($booking);
    }

    public function messages(Request $request, Booking $booking): AnonymousResourceCollection
    {
        $this->authorizeAdmin($request->user());

        $validated = $request->validate([
            'sender_account_id' => ['nullable', 'string', 'max:36'],
            'moderated_by_admin_account_id' => ['nullable', 'string', 'max:36'],
            'moderation_status' => ['nullable', 'string', 'max:50'],
            'detected_contact_exchange' => ['nullable', 'boolean'],
            'read_status' => ['nullable', Rule::in(['read', 'unread'])],
            'has_admin_notes' => ['nullable', 'boolean'],
            'has_open_report' => ['nullable', 'boolean'],
        ]);
        $senderAccountId = $this->resolveAccountId($validated['sender_account_id'] ?? null);
        $moderatedByAdminId = $this->resolveAccountId($validated['moderated_by_admin_account_id'] ?? null);

        $messages = $booking->messages()
            ->with(['booking', 'sender', 'moderatedByAdmin'])
            ->withCount([
                'adminNotes',
                'sourceReports as open_report_count' => fn ($query) => $query->where('status', Report::STATUS_OPEN),
            ])
            ->when($senderAccountId, fn ($query, int $id) => $query->where('sender_account_id', $id))
            ->when($moderatedByAdminId, fn ($query, int $id) => $query->where('moderated_by_admin_account_id', $id))
            ->when(
                $validated['moderation_status'] ?? null,
                fn ($query, string $status) => $query->where('moderation_status', $status)
            )
            ->when(
                array_key_exists('detected_contact_exchange', $validated),
                fn ($query) => $query->where(
                    'detected_contact_exchange',
                    (bool) $validated['detected_contact_exchange']
                )
            )
            ->when(
                $validated['read_status'] ?? null,
                fn ($query, string $readStatus) => $readStatus === 'read'
                    ? $query->whereNotNull('read_at')
                    : $query->whereNull('read_at')
            )
            ->when(
                array_key_exists('has_admin_notes', $validated),
                fn ($query) => $validated['has_admin_notes']
                    ? $query->whereHas('adminNotes')
                    : $query->whereDoesntHave('adminNotes')
            )
            ->when(
                array_key_exists('has_open_report', $validated),
                fn ($query) => $validated['has_open_report']
                    ? $query->whereHas('sourceReports', fn ($query) => $query->where('status', Report::STATUS_OPEN))
                    : $query->whereDoesntHave('sourceReports', fn ($query) => $query->where('status', Report::STATUS_OPEN))
            )
            ->oldest('sent_at')
            ->get();

        $this->recordAdminAudit($request, 'booking.messages.view', $booking, [], array_merge(
            $this->snapshot($booking),
            [
                'filters' => $validated,
                'message_count' => $messages->count(),
            ],
        ));

        return AdminBookingMessageResource::collection($messages);
    }

    public function note(Request $request, Booking $booking, BookingMessage $message): AdminBookingMessageResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        $this->ensureBookingMessageBelongsToBooking($booking, $message);

        $validated = $request->validate([
            'note' => ['required', 'string', 'max:2000'],
        ]);
        $before = $this->snapshotMessage($message);

        $message->adminNotes()->create([
            'author_account_id' => $admin->id,
            'note_encrypted' => Crypt::encryptString($validated['note']),
        ]);

        $this->recordAdminAudit(
            $request,
            'booking.message.note',
            $message,
            $before,
            $this->snapshotMessage($message->fresh())
        );

        return new AdminBookingMessageResource($this->loadAdminMessage($message->fresh()));
    }

    public function createReport(Request $request, Booking $booking, BookingMessage $message): JsonResponse
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        $this->ensureBookingMessageBelongsToBooking($booking, $message);
        abort_if(
            $message->sourceReports()->where('status', Report::STATUS_OPEN)->exists(),
            409,
            'An open report already exists for this message.'
        );

        $validated = $request->validate([
            'category' => ['required', 'string', 'max:100'],
            'severity' => ['nullable', Rule::in([
                Report::SEVERITY_LOW,
                Report::SEVERITY_MEDIUM,
                Report::SEVERITY_HIGH,
                Report::SEVERITY_CRITICAL,
            ])],
            'detail' => ['nullable', 'string', 'max:2000'],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);
        $before = $this->snapshotMessage($message);

        $report = Report::create([
            'public_id' => 'rep_'.Str::ulid(),
            'booking_id' => $booking->id,
            'source_booking_message_id' => $message->id,
            'reporter_account_id' => $admin->id,
            'target_account_id' => $message->sender_account_id,
            'category' => $validated['category'],
            'severity' => $validated['severity'] ?? Report::SEVERITY_MEDIUM,
            'detail_encrypted' => filled($validated['detail'] ?? null)
                ? Crypt::encryptString($validated['detail'])
                : null,
            'status' => Report::STATUS_OPEN,
            'assigned_admin_account_id' => $admin->id,
        ]);
        $report->actions()->create([
            'admin_account_id' => $admin->id,
            'action_type' => 'report_created_from_message',
            'note_encrypted' => filled($validated['note'] ?? null)
                ? Crypt::encryptString($validated['note'])
                : null,
            'metadata_json' => [
                'source_booking_message_id' => $message->id,
                'sender_account_id' => $message->sender_account_id,
                'detected_contact_exchange' => $message->detected_contact_exchange,
                'prior_moderation_status' => $message->moderation_status,
            ],
            'created_at' => now(),
        ]);

        $message->forceFill([
            'moderation_status' => BookingMessage::MODERATION_STATUS_ESCALATED,
            'moderated_by_admin_account_id' => $admin->id,
            'moderated_at' => now(),
        ])->save();

        if (filled($validated['note'] ?? null)) {
            $message->adminNotes()->create([
                'author_account_id' => $admin->id,
                'note_encrypted' => Crypt::encryptString($validated['note']),
            ]);
        }

        $this->recordAdminAudit(
            $request,
            'booking.message.report_create',
            $report,
            [],
            array_merge($this->snapshotReport($report), [
                'source_message_before' => $before,
                'source_message_after' => $this->snapshotMessage($message->fresh()),
            ])
        );

        return (new AdminReportResource($report->load([
            'booking',
            'sourceBookingMessage.sender',
            'reporter',
            'target',
            'assignedAdmin',
            'actions.admin',
        ])))
            ->response()
            ->setStatusCode(201);
    }

    public function suspendSender(Request $request, Booking $booking, BookingMessage $message): AdminAccountResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        $this->ensureBookingMessageBelongsToBooking($booking, $message);

        $sender = $message->sender;
        abort_unless($sender, 409, 'Sender account is unavailable.');

        $validated = $request->validate([
            'reason_code' => ['required', 'string', 'max:100'],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);
        $accountBefore = $this->snapshotAccount($sender);
        $messageBefore = $this->snapshotMessage($message);

        $this->suspendAccount($sender, $admin, $validated['reason_code']);

        $message->forceFill([
            'moderation_status' => BookingMessage::MODERATION_STATUS_ESCALATED,
            'moderated_by_admin_account_id' => $admin->id,
            'moderated_at' => now(),
        ])->save();

        if (filled($validated['note'] ?? null)) {
            $message->adminNotes()->create([
                'author_account_id' => $admin->id,
                'note_encrypted' => Crypt::encryptString($validated['note']),
            ]);
        }

        $this->recordAdminAudit(
            $request,
            'account.suspend',
            $sender,
            $accountBefore,
            $this->snapshotAccount($sender->refresh())
        );
        $this->recordAdminAudit(
            $request,
            'booking.message.suspend_sender',
            $message,
            $messageBefore,
            $this->snapshotMessage($message->fresh())
        );

        return new AdminAccountResource($sender->load([
            'roleAssignments',
            'latestIdentityVerification',
            'userProfile',
            'therapistProfile',
        ]));
    }

    public function moderate(Request $request, Booking $booking, BookingMessage $message): AdminBookingMessageResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        $this->ensureBookingMessageBelongsToBooking($booking, $message);

        $validated = $request->validate([
            'moderation_status' => ['required', Rule::in(BookingMessage::moderationStatuses())],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);
        $before = $this->snapshotMessage($message);

        $message->forceFill([
            'moderation_status' => $validated['moderation_status'],
            'moderated_by_admin_account_id' => $admin->id,
            'moderated_at' => now(),
        ])->save();

        if (filled($validated['note'] ?? null)) {
            $message->adminNotes()->create([
                'author_account_id' => $admin->id,
                'note_encrypted' => Crypt::encryptString($validated['note']),
            ]);
        }

        $this->recordAdminAudit(
            $request,
            'booking.message.moderate',
            $message,
            $before,
            $this->snapshotMessage($message->fresh())
        );

        return new AdminBookingMessageResource($this->loadAdminMessage($message->fresh()));
    }

    private function bookingStatuses(): array
    {
        return [
            Booking::STATUS_PAYMENT_AUTHORIZING,
            Booking::STATUS_REQUESTED,
            Booking::STATUS_ACCEPTED,
            Booking::STATUS_REJECTED,
            Booking::STATUS_PAYMENT_CANCELED,
            Booking::STATUS_CANCELED,
            Booking::STATUS_INTERRUPTED,
            Booking::STATUS_MOVING,
            Booking::STATUS_ARRIVED,
            Booking::STATUS_IN_PROGRESS,
            Booking::STATUS_THERAPIST_COMPLETED,
            Booking::STATUS_COMPLETED,
        ];
    }

    private function snapshot(Booking $booking): array
    {
        return $booking->only([
            'id',
            'public_id',
            'user_account_id',
            'therapist_account_id',
            'therapist_profile_id',
            'therapist_menu_id',
            'service_address_id',
            'status',
            'scheduled_start_at',
            'scheduled_end_at',
            'total_amount',
        ]);
    }

    private function ensureBookingMessageBelongsToBooking(Booking $booking, BookingMessage $message): void
    {
        abort_unless($message->booking_id === $booking->id, 404);
    }

    private function loadAdminMessage(BookingMessage $message): BookingMessage
    {
        return $message->load(['booking', 'sender', 'moderatedByAdmin', 'adminNotes.author'])->loadCount([
            'adminNotes',
            'sourceReports as open_report_count' => fn ($query) => $query->where('status', Report::STATUS_OPEN),
        ]);
    }

    private function snapshotMessage(BookingMessage $message): array
    {
        return array_merge(
            $message->only([
                'id',
                'booking_id',
                'sender_account_id',
                'message_type',
                'detected_contact_exchange',
                'moderation_status',
                'moderated_by_admin_account_id',
                'moderated_at',
                'sent_at',
                'read_at',
            ]),
            [
                'admin_note_count' => $message->adminNotes()->count(),
                'open_report_count' => $message->sourceReports()->where('status', Report::STATUS_OPEN)->count(),
            ],
        );
    }

    private function snapshotReport(Report $report): array
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

    private function snapshotAccount(Account $account): array
    {
        return $account->only([
            'id',
            'public_id',
            'email',
            'phone_e164',
            'display_name',
            'status',
            'last_active_role',
            'suspended_at',
            'suspension_reason',
        ]);
    }
}
