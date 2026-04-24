<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Api\Concerns\RecordsAdminAuditLogs;
use App\Http\Controllers\Api\Concerns\ResolvesAdminFilterIds;
use App\Http\Controllers\Controller;
use App\Http\Resources\AdminBookingDetailResource;
use App\Http\Resources\AdminBookingListResource;
use App\Http\Resources\AdminBookingMessageResource;
use App\Models\Booking;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class AdminBookingController extends Controller
{
    use AuthorizesAdminRequests;
    use RecordsAdminAuditLogs;
    use ResolvesAdminFilterIds;

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorizeAdmin($request->user());

        $validated = $request->validate([
            'user_account_id' => ['nullable', 'string', 'max:36'],
            'therapist_account_id' => ['nullable', 'string', 'max:36'],
            'therapist_profile_id' => ['nullable', 'string', 'max:36'],
            'status' => ['nullable', Rule::in($this->bookingStatuses())],
            'is_on_demand' => ['nullable', 'boolean'],
            'payment_intent_status' => ['nullable', 'string', 'max:50'],
            'has_refund_request' => ['nullable', 'boolean'],
            'has_open_report' => ['nullable', 'boolean'],
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
                    'currentPaymentIntent',
                ])
                ->withCount([
                    'refunds',
                    'reports',
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
                    array_key_exists('has_open_report', $validated),
                    fn ($query) => $validated['has_open_report']
                        ? $query->whereHas('reports', fn ($query) => $query->where('status', 'open'))
                        : $query->whereDoesntHave('reports', fn ($query) => $query->where('status', 'open'))
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
            'currentQuote',
            'currentPaymentIntent',
            'refunds.booking',
            'refunds.requestedBy',
            'refunds.reviewedBy',
            'reports.booking',
            'reports.reporter',
            'reports.target',
            'reports.assignedAdmin',
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
            'moderation_status' => ['nullable', 'string', 'max:50'],
            'detected_contact_exchange' => ['nullable', 'boolean'],
            'read_status' => ['nullable', Rule::in(['read', 'unread'])],
        ]);
        $senderAccountId = $this->resolveAccountId($validated['sender_account_id'] ?? null);

        $messages = $booking->messages()
            ->with(['booking', 'sender'])
            ->when($senderAccountId, fn ($query, int $id) => $query->where('sender_account_id', $id))
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

    private function bookingStatuses(): array
    {
        return [
            Booking::STATUS_PAYMENT_AUTHORIZING,
            Booking::STATUS_REQUESTED,
            Booking::STATUS_ACCEPTED,
            Booking::STATUS_REJECTED,
            Booking::STATUS_PAYMENT_CANCELED,
            Booking::STATUS_CANCELED,
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
}
