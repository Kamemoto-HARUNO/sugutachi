<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Api\Concerns\RecordsAdminAuditLogs;
use App\Http\Controllers\Api\Concerns\ResolvesAdminFilterIds;
use App\Http\Controllers\Controller;
use App\Http\Resources\AdminBookingDetailResource;
use App\Http\Resources\AdminBookingListResource;
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
            'scheduled_from' => ['nullable', 'date'],
            'scheduled_to' => ['nullable', 'date'],
            'completed_on' => ['nullable', 'date'],
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
                ->withCount(['refunds', 'reports'])
                ->when($userAccountId, fn ($query, int $id) => $query->where('user_account_id', $id))
                ->when($therapistAccountId, fn ($query, int $id) => $query->where('therapist_account_id', $id))
                ->when($therapistProfileId, fn ($query, int $id) => $query->where('therapist_profile_id', $id))
                ->when($validated['status'] ?? null, fn ($query, string $status) => $query->where('status', $status))
                ->when($validated['scheduled_from'] ?? null, fn ($query, string $date) => $query->whereDate('scheduled_start_at', '>=', $date))
                ->when($validated['scheduled_to'] ?? null, fn ($query, string $date) => $query->whereDate('scheduled_start_at', '<=', $date))
                ->when($validated['completed_on'] ?? null, fn ($query, string $date) => $query
                    ->where('status', Booking::STATUS_COMPLETED)
                    ->whereDate('updated_at', $date))
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
