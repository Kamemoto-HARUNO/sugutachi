<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BookingResource;
use App\Models\Booking;
use App\Models\BookingQuote;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class BookingController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $account = $request->user();

        return BookingResource::collection(
            Booking::query()
                ->with('currentQuote')
                ->where(fn ($query) => $query
                    ->where('user_account_id', $account->id)
                    ->orWhere('therapist_account_id', $account->id))
                ->latest()
                ->get()
        );
    }

    public function therapistRequests(Request $request): AnonymousResourceCollection
    {
        return BookingResource::collection(
            Booking::query()
                ->with('currentQuote')
                ->where('therapist_account_id', $request->user()->id)
                ->where('status', Booking::STATUS_REQUESTED)
                ->oldest()
                ->get()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'quote_id' => ['required', 'string', 'max:36'],
        ]);

        $quote = BookingQuote::query()
            ->with(['therapistProfile.account', 'therapistMenu'])
            ->where('public_id', $validated['quote_id'])
            ->whereNull('booking_id')
            ->firstOrFail();

        abort_if($quote->expires_at && $quote->expires_at->isPast(), 409, 'The quote has expired.');

        $serviceAddress = $request->user()
            ->serviceAddresses()
            ->where('public_id', $quote->input_snapshot_json['service_address_id'] ?? null)
            ->firstOrFail();

        $booking = DB::transaction(function () use ($request, $quote, $serviceAddress): Booking {
            $input = $quote->input_snapshot_json;
            $requestedStartAt = $input['requested_start_at'] ?? null;
            $durationMinutes = $quote->duration_minutes;

            $booking = Booking::create([
                'public_id' => 'book_'.Str::ulid(),
                'user_account_id' => $request->user()->id,
                'therapist_account_id' => $quote->therapistProfile->account_id,
                'therapist_profile_id' => $quote->therapist_profile_id,
                'therapist_menu_id' => $quote->therapist_menu_id,
                'service_address_id' => $serviceAddress->id,
                'status' => Booking::STATUS_PAYMENT_AUTHORIZING,
                'is_on_demand' => $input['is_on_demand'] ?? true,
                'requested_start_at' => $requestedStartAt,
                'scheduled_start_at' => $requestedStartAt,
                'scheduled_end_at' => $requestedStartAt ? CarbonImmutable::parse($requestedStartAt)->addMinutes($durationMinutes) : null,
                'duration_minutes' => $durationMinutes,
                'request_expires_at' => null,
                'total_amount' => $quote->total_amount,
                'therapist_net_amount' => $quote->therapist_net_amount,
                'platform_fee_amount' => $quote->platform_fee_amount,
                'matching_fee_amount' => $quote->matching_fee_amount,
                'user_snapshot_json' => [
                    'account_public_id' => $request->user()->public_id,
                ],
                'therapist_snapshot_json' => [
                    'account_public_id' => $quote->therapistProfile->account->public_id,
                    'therapist_profile_public_id' => $quote->therapistProfile->public_id,
                    'therapist_public_name' => $quote->therapistProfile->public_name,
                    'menu_public_id' => $quote->therapistMenu->public_id,
                    'menu_name' => $quote->therapistMenu->name,
                ],
            ]);

            $quote->update(['booking_id' => $booking->id]);
            $booking->update(['current_quote_id' => $quote->id]);

            $booking->statusLogs()->create([
                'to_status' => Booking::STATUS_PAYMENT_AUTHORIZING,
                'actor_account_id' => $request->user()->id,
                'actor_role' => 'user',
                'reason_code' => 'booking_created',
                'metadata_json' => [
                    'quote_id' => $quote->public_id,
                ],
            ]);

            return $booking;
        });

        return (new BookingResource($booking->load('currentQuote')))
            ->response()
            ->setStatusCode(201);
    }

    public function show(Request $request, Booking $booking): BookingResource
    {
        $accountId = $request->user()->id;

        abort_unless(
            $booking->user_account_id === $accountId || $booking->therapist_account_id === $accountId,
            404
        );

        return new BookingResource($booking->load('currentQuote'));
    }
}
