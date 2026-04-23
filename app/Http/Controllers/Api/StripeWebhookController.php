<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Payments\StripeWebhookHandler;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;
use Stripe\Exception\SignatureVerificationException;
use Stripe\Exception\UnexpectedValueException;
use Stripe\Webhook;

class StripeWebhookController extends Controller
{
    public function __invoke(Request $request, StripeWebhookHandler $handler): JsonResponse
    {
        $secret = config('services.stripe.webhook_secret');

        if (! $secret) {
            throw new RuntimeException('Stripe webhook secret is not configured.');
        }

        try {
            $event = Webhook::constructEvent(
                payload: $request->getContent(),
                sigHeader: (string) $request->header('Stripe-Signature'),
                secret: $secret,
            );
        } catch (UnexpectedValueException|SignatureVerificationException) {
            return response()->json([
                'message' => 'Invalid Stripe webhook payload.',
            ], 400);
        }

        $webhookEvent = $handler->handle($event);

        return response()->json([
            'received' => true,
            'status' => $webhookEvent->processed_status,
        ]);
    }
}
