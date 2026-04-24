<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BookingResource;
use App\Http\Resources\TherapistBookingRequestResource;
use App\Models\Account;
use App\Models\Booking;
use App\Models\BookingQuote;
use App\Models\ServiceAddress;
use App\Models\TherapistAvailabilitySlot;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use App\Services\Bookings\ScheduledBookingPolicy;
use App\Services\Scheduling\PublicAvailabilityWindowCalculator;
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
        return TherapistBookingRequestResource::collection(
            Booking::query()
                ->with(['currentQuote', 'availabilitySlot', 'serviceAddress', 'therapistMenu'])
                ->where('therapist_account_id', $request->user()->id)
                ->where('status', Booking::STATUS_REQUESTED)
                ->orderByRaw('case when request_expires_at is null then 1 else 0 end')
                ->orderBy('request_expires_at')
                ->orderBy('requested_start_at')
                ->orderBy('id')
                ->get()
        );
    }

    public function store(
        Request $request,
        PublicAvailabilityWindowCalculator $availabilityCalculator,
        ScheduledBookingPolicy $scheduledBookingPolicy,
    ): JsonResponse {
        $validated = $request->validate([
            'quote_id' => ['required', 'string', 'max:36'],
        ]);

        $quoteSnapshot = BookingQuote::query()
            ->where('public_id', $validated['quote_id'])
            ->firstOrFail();

        $serviceAddress = $request->user()
            ->serviceAddresses()
            ->where('public_id', data_get($quoteSnapshot->input_snapshot_json, 'service_address_id'))
            ->firstOrFail();

        $booking = DB::transaction(function () use (
            $availabilityCalculator,
            $request,
            $scheduledBookingPolicy,
            $serviceAddress,
            $validated
        ): Booking {
            $quote = BookingQuote::query()
                ->with(['therapistProfile.account', 'therapistProfile.bookingSetting', 'therapistMenu'])
                ->where('public_id', $validated['quote_id'])
                ->lockForUpdate()
                ->firstOrFail();

            abort_if($quote->booking_id !== null, 409, 'The quote has already been used.');
            abort_if($quote->expires_at && $quote->expires_at->isPast(), 409, 'The quote has expired.');

            $input = $quote->input_snapshot_json;
            $requestedStartAt = filled($input['requested_start_at'] ?? null)
                ? CarbonImmutable::parse($input['requested_start_at'])
                : null;
            $durationMinutes = $quote->duration_minutes;
            $isOnDemand = $input['is_on_demand'] ?? true;
            $slot = null;
            $requestExpiresAt = null;

            if ($isOnDemand) {
                $this->ensureOnDemandQuoteStillBookable($request->user(), $quote);
            } else {
                abort_if(! $requestedStartAt, 409, 'The scheduled quote is missing a requested start time.');

                $slot = $this->ensureScheduledQuoteStillBookable(
                    viewer: $request->user(),
                    quote: $quote,
                    serviceAddress: $serviceAddress,
                    availabilityCalculator: $availabilityCalculator,
                );

                $scheduledBookingPolicy->assertCanCreateRequest(
                    user: $request->user(),
                    therapistProfileId: $quote->therapist_profile_id,
                    requestedStartAt: $requestedStartAt,
                );

                $requestExpiresAt = $scheduledBookingPolicy->requestExpiresAt(
                    bookingSetting: $quote->therapistProfile->bookingSetting,
                    requestedStartAt: $requestedStartAt,
                );
            }

            $booking = Booking::create([
                'public_id' => 'book_'.Str::ulid(),
                'user_account_id' => $request->user()->id,
                'therapist_account_id' => $quote->therapistProfile->account_id,
                'therapist_profile_id' => $quote->therapist_profile_id,
                'therapist_menu_id' => $quote->therapist_menu_id,
                'service_address_id' => $serviceAddress->id,
                'availability_slot_id' => $slot?->id,
                'status' => Booking::STATUS_PAYMENT_AUTHORIZING,
                'is_on_demand' => $isOnDemand,
                'requested_start_at' => $requestedStartAt,
                'scheduled_start_at' => $requestedStartAt,
                'scheduled_end_at' => $requestedStartAt?->addMinutes($durationMinutes),
                'duration_minutes' => $durationMinutes,
                'buffer_before_minutes' => 0,
                'buffer_after_minutes' => 0,
                'request_expires_at' => $requestExpiresAt,
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

            return $booking->load('currentQuote');
        });

        return (new BookingResource($booking))
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

        return new BookingResource($booking->load([
            'currentQuote',
            'currentPaymentIntent',
            'canceledBy',
            'refunds' => fn ($query) => $query->latest('id'),
        ]));
    }

    private function ensureOnDemandQuoteStillBookable(Account $viewer, BookingQuote $quote): void
    {
        $isBookable = TherapistProfile::query()
            ->discoverableTo($viewer)
            ->whereKey($quote->therapist_profile_id)
            ->whereHas('menus', fn ($query) => $query
                ->whereKey($quote->therapist_menu_id)
                ->where('is_active', true))
            ->exists();

        abort_unless($isBookable, 404);
    }

    private function ensureScheduledQuoteStillBookable(
        Account $viewer,
        BookingQuote $quote,
        ServiceAddress $serviceAddress,
        PublicAvailabilityWindowCalculator $availabilityCalculator,
    ): TherapistAvailabilitySlot {
        $profile = TherapistProfile::query()
            ->scheduledDiscoverableTo($viewer)
            ->with('bookingSetting')
            ->whereKey($quote->therapist_profile_id)
            ->firstOrFail();

        $menu = TherapistMenu::query()
            ->whereKey($quote->therapist_menu_id)
            ->where('therapist_profile_id', $profile->id)
            ->where('is_active', true)
            ->firstOrFail();

        $requestedStartAt = CarbonImmutable::parse($quote->input_snapshot_json['requested_start_at']);
        $slot = TherapistAvailabilitySlot::query()
            ->where('public_id', $quote->input_snapshot_json['availability_slot_id'] ?? null)
            ->where('therapist_profile_id', $profile->id)
            ->where('status', TherapistAvailabilitySlot::STATUS_PUBLISHED)
            ->firstOrFail();

        $availability = $availabilityCalculator->calculate(
            profile: $profile,
            menu: $menu,
            serviceAddress: $serviceAddress,
            date: $requestedStartAt->startOfDay(),
        );

        $matchingWindow = collect($availability['windows'])
            ->first(fn (array $window): bool => $window['availability_slot_id'] === $slot->public_id
                && CarbonImmutable::instance($window['start_at'])->lte($requestedStartAt)
                && CarbonImmutable::instance($window['end_at'])->gte($requestedStartAt->addMinutes($quote->duration_minutes)));

        abort_if(
            ! $matchingWindow,
            409,
            'The requested time is no longer available for that slot.'
        );

        return $slot;
    }
}
