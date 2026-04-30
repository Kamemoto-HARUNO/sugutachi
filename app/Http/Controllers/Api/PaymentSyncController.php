<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BookingResource;
use App\Http\Resources\PaymentIntentResource;
use App\Models\Booking;
use App\Models\PaymentIntent;
use App\Services\Campaigns\CampaignService;
use App\Services\Bookings\ScheduledBookingPolicy;
use App\Services\Notifications\BookingNotificationService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Stripe\StripeClient;
use Throwable;

class PaymentSyncController extends Controller
{
    public function store(
        Request $request,
        Booking $booking,
        CampaignService $campaignService,
        ScheduledBookingPolicy $scheduledBookingPolicy,
        BookingNotificationService $bookingNotificationService,
    ): JsonResponse {
        abort_unless($booking->user_account_id === $request->user()->id, 404);

        $this->syncCurrentPaymentIntentFromStripe(
            booking: $booking,
            campaignService: $campaignService,
            scheduledBookingPolicy: $scheduledBookingPolicy,
            bookingNotificationService: $bookingNotificationService,
        );

        $this->loadBookingRelations($booking);

        return response()->json([
            'data' => [
                'booking' => (new BookingResource($booking))->resolve($request),
                'payment_intent' => $booking->currentPaymentIntent
                    ? (new PaymentIntentResource($booking->currentPaymentIntent))->resolve($request)
                    : null,
            ],
        ]);
    }

    private function syncCurrentPaymentIntentFromStripe(
        Booking $booking,
        CampaignService $campaignService,
        ScheduledBookingPolicy $scheduledBookingPolicy,
        BookingNotificationService $bookingNotificationService,
    ): void {
        if ($booking->status !== Booking::STATUS_PAYMENT_AUTHORIZING) {
            return;
        }

        $currentPaymentIntent = $booking->currentPaymentIntent()->first();
        $secret = config('services.stripe.secret');

        if (! $currentPaymentIntent || blank($secret)) {
            return;
        }

        try {
            $stripePaymentIntent = (new StripeClient($secret))
                ->paymentIntents
                ->retrieve($currentPaymentIntent->stripe_payment_intent_id, []);
        } catch (Throwable $exception) {
            Log::warning('Failed to sync PaymentIntent state from Stripe.', [
                'booking_public_id' => $booking->public_id,
                'stripe_payment_intent_id' => $currentPaymentIntent->stripe_payment_intent_id,
                'message' => $exception->getMessage(),
            ]);

            return;
        }

        $status = (string) ($stripePaymentIntent->status ?? $currentPaymentIntent->status);

        DB::transaction(function () use ($booking, $status, $scheduledBookingPolicy, $bookingNotificationService): void {
            $lockedBooking = Booking::query()
                ->whereKey($booking->id)
                ->lockForUpdate()
                ->firstOrFail();

            $lockedPaymentIntent = $lockedBooking->paymentIntents()
                ->where('is_current', true)
                ->latest('id')
                ->lockForUpdate()
                ->first();

            if (! $lockedPaymentIntent) {
                return;
            }

            $attributes = [
                'status' => $status,
            ];

            if ($status === PaymentIntent::STRIPE_STATUS_REQUIRES_CAPTURE) {
                $attributes['authorized_at'] = $lockedPaymentIntent->authorized_at ?? now();
            }

            if ($status === PaymentIntent::STRIPE_STATUS_SUCCEEDED) {
                $attributes['captured_at'] = $lockedPaymentIntent->captured_at ?? now();
            }

            if ($status === PaymentIntent::STRIPE_STATUS_CANCELED) {
                $attributes['canceled_at'] = $lockedPaymentIntent->canceled_at ?? now();
            }

            $lockedPaymentIntent->forceFill($attributes)->save();

            if ($status === PaymentIntent::STRIPE_STATUS_REQUIRES_CAPTURE
                && $lockedBooking->status === Booking::STATUS_PAYMENT_AUTHORIZING) {
                $requestExpiresAt = $lockedBooking->is_on_demand
                    ? now()->addMinutes(10)
                    : $scheduledBookingPolicy->requestExpiresAt(
                        bookingSetting: $lockedBooking->therapistProfile->bookingSetting,
                        requestedStartAt: CarbonImmutable::instance($lockedBooking->requested_start_at),
                        createdAt: CarbonImmutable::instance($lockedBooking->created_at),
                    );

                $lockedBooking->forceFill([
                    'status' => Booking::STATUS_REQUESTED,
                    'request_expires_at' => $requestExpiresAt,
                ])->save();

                $lockedBooking->statusLogs()->create([
                    'from_status' => Booking::STATUS_PAYMENT_AUTHORIZING,
                    'to_status' => Booking::STATUS_REQUESTED,
                    'actor_role' => 'system',
                    'reason_code' => 'payment_authorized',
                    'metadata_json' => [
                        'source' => 'payment_sync',
                        'stripe_payment_intent_id' => $lockedPaymentIntent->stripe_payment_intent_id,
                    ],
                ]);

                $bookingNotificationService->notifyRequested($lockedBooking->refresh());

                return;
            }

            if ($status === PaymentIntent::STRIPE_STATUS_CANCELED
                && in_array($lockedBooking->status, [Booking::STATUS_PAYMENT_AUTHORIZING, Booking::STATUS_REQUESTED], true)) {
                $fromStatus = $lockedBooking->status;

                $lockedBooking->forceFill([
                    'status' => Booking::STATUS_PAYMENT_CANCELED,
                    'request_expires_at' => null,
                    'canceled_at' => $lockedBooking->canceled_at ?? now(),
                    'cancel_reason_code' => 'payment_intent_canceled',
                ])->save();

                $lockedBooking->statusLogs()->create([
                    'from_status' => $fromStatus,
                    'to_status' => Booking::STATUS_PAYMENT_CANCELED,
                    'actor_role' => 'system',
                    'reason_code' => 'payment_intent_canceled',
                    'metadata_json' => [
                        'source' => 'payment_sync',
                        'stripe_payment_intent_id' => $lockedPaymentIntent->stripe_payment_intent_id,
                    ],
                ]);

                $campaignService->restoreBookingCampaignApplication($lockedBooking->refresh(), 'payment_intent_canceled');
                $bookingNotificationService->notifyCanceled($lockedBooking->refresh());
            }
        });
    }

    private function loadBookingRelations(Booking $booking): void
    {
        $booking->load([
            'currentQuote',
            'currentPaymentIntent',
            'canceledBy',
            'refunds' => fn ($query) => $query->latest('id'),
        ]);
    }
}
