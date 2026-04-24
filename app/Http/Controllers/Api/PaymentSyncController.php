<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BookingResource;
use App\Http\Resources\PaymentIntentResource;
use App\Models\Booking;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentSyncController extends Controller
{
    public function store(Request $request, Booking $booking): JsonResponse
    {
        abort_unless($booking->user_account_id === $request->user()->id, 404);

        $booking->load([
            'currentQuote',
            'currentPaymentIntent',
            'canceledBy',
            'refunds' => fn ($query) => $query->latest('id'),
        ]);

        return response()->json([
            'data' => [
                'booking' => (new BookingResource($booking))->resolve($request),
                'payment_intent' => $booking->currentPaymentIntent
                    ? (new PaymentIntentResource($booking->currentPaymentIntent))->resolve($request)
                    : null,
            ],
        ]);
    }
}
