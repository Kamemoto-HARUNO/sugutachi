<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Api\Concerns\ResolvesAdminFilterIds;
use App\Http\Controllers\Controller;
use App\Http\Resources\AdminStripeDisputeResource;
use App\Models\StripeDispute;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class AdminStripeDisputeController extends Controller
{
    use AuthorizesAdminRequests;
    use ResolvesAdminFilterIds;

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorizeAdmin($request->user());

        $validated = $request->validate([
            'booking_id' => ['nullable', 'string', 'max:36'],
            'status' => ['nullable', Rule::in([
                StripeDispute::STATUS_NEEDS_RESPONSE,
                StripeDispute::STATUS_UNDER_REVIEW,
                StripeDispute::STATUS_WON,
                StripeDispute::STATUS_LOST,
            ])],
            'reason' => ['nullable', 'string', 'max:100'],
            'q' => ['nullable', 'string', 'max:100'],
            'sort' => ['nullable', Rule::in(['created_at', 'updated_at', 'evidence_due_by', 'amount'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
        ]);
        $bookingId = $this->resolveBookingId($validated['booking_id'] ?? null);
        $sort = $validated['sort'] ?? 'created_at';
        $direction = $validated['direction'] ?? 'desc';

        return AdminStripeDisputeResource::collection(
            StripeDispute::query()
                ->with(['booking.userAccount', 'booking.therapistAccount', 'paymentIntent'])
                ->when($bookingId, fn ($query, int $id) => $query->where('booking_id', $id))
                ->when($validated['status'] ?? null, fn ($query, string $status) => $query->where('status', $status))
                ->when($validated['reason'] ?? null, fn ($query, string $reason) => $query->where('reason', $reason))
                ->when($validated['q'] ?? null, function ($query, string $term): void {
                    $query->where(function ($query) use ($term): void {
                        $query
                            ->where('stripe_dispute_id', 'like', "%{$term}%")
                            ->orWhereHas('booking', fn ($query) => $query->where('public_id', $term))
                            ->orWhereHas('paymentIntent', fn ($query) => $query
                                ->where('stripe_payment_intent_id', 'like', "%{$term}%"));
                    });
                })
                ->orderBy($sort, $direction)
                ->orderBy('id', $direction)
                ->get()
        );
    }
}
