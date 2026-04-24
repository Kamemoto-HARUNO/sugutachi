<?php

namespace App\Services\Bookings;

use App\Contracts\Payments\PaymentIntentGateway;
use App\Models\Booking;
use App\Models\PaymentIntent;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Throwable;

class BookingRequestExpirationService
{
    private const EXPIRES_PENDING_STATUSES = [
        Booking::STATUS_PAYMENT_AUTHORIZING,
        Booking::STATUS_REQUESTED,
    ];

    public function __construct(
        private readonly PaymentIntentGateway $paymentIntentGateway,
    ) {}

    /**
     * @return array{expired: int, failed: int}
     */
    public function expireDueScheduledRequests(?CarbonInterface $now = null): array
    {
        $now ??= now();
        $expired = 0;
        $failed = 0;

        $candidateIds = Booking::query()
            ->where('is_on_demand', false)
            ->whereIn('status', self::EXPIRES_PENDING_STATUSES)
            ->whereNotNull('request_expires_at')
            ->where('request_expires_at', '<=', $now)
            ->orderBy('id')
            ->pluck('id');

        foreach ($candidateIds as $bookingId) {
            try {
                $didExpire = DB::transaction(function () use ($bookingId, $now): bool {
                    $booking = Booking::query()
                        ->whereKey($bookingId)
                        ->lockForUpdate()
                        ->first();

                    if (! $booking) {
                        return false;
                    }

                    if (
                        $booking->is_on_demand
                        || ! in_array($booking->status, self::EXPIRES_PENDING_STATUSES, true)
                        || $booking->request_expires_at === null
                        || $booking->request_expires_at->isFuture()
                    ) {
                        return false;
                    }

                    $paymentIntent = PaymentIntent::query()
                        ->where('booking_id', $booking->id)
                        ->where('is_current', true)
                        ->latest('id')
                        ->lockForUpdate()
                        ->first();

                    if ($paymentIntent && ! in_array($paymentIntent->status, [
                        PaymentIntent::STRIPE_STATUS_SUCCEEDED,
                        PaymentIntent::STRIPE_STATUS_CANCELED,
                    ], true)) {
                        $paymentIntent->forceFill([
                            'status' => $this->paymentIntentGateway->cancel($paymentIntent),
                            'canceled_at' => $paymentIntent->canceled_at ?? $now,
                            'last_stripe_event_id' => 'system.booking_request_expired',
                        ])->save();
                    }

                    $fromStatus = $booking->status;

                    $booking->forceFill([
                        'status' => Booking::STATUS_EXPIRED,
                    ])->save();

                    $booking->statusLogs()->create([
                        'from_status' => $fromStatus,
                        'to_status' => Booking::STATUS_EXPIRED,
                        'actor_role' => 'system',
                        'reason_code' => 'request_expired',
                    ]);

                    return true;
                });

                if ($didExpire) {
                    $expired++;
                }
            } catch (Throwable $exception) {
                report($exception);
                $failed++;
            }
        }

        return [
            'expired' => $expired,
            'failed' => $failed,
        ];
    }
}
