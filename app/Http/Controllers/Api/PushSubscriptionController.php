<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PushSubscriptionResource;
use App\Models\PushSubscription;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;

class PushSubscriptionController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'endpoint' => ['required', 'url', 'max:2048'],
            'keys.p256dh' => ['required', 'string', 'max:512'],
            'keys.auth' => ['required', 'string', 'max:512'],
            'permission_status' => ['nullable', 'string', 'in:granted,default,denied'],
        ]);

        $endpointHash = hash('sha256', $validated['endpoint']);
        $subscription = PushSubscription::query()->updateOrCreate(
            ['endpoint_hash' => $endpointHash],
            [
                'account_id' => $request->user()->id,
                'endpoint_encrypted' => Crypt::encryptString($validated['endpoint']),
                'p256dh_encrypted' => Crypt::encryptString($validated['keys']['p256dh']),
                'auth_encrypted' => Crypt::encryptString($validated['keys']['auth']),
                'user_agent_hash' => $request->userAgent()
                    ? hash('sha256', $request->userAgent())
                    : null,
                'permission_status' => $validated['permission_status'] ?? 'granted',
                'last_used_at' => now(),
                'revoked_at' => null,
            ],
        );

        return (new PushSubscriptionResource($subscription))
            ->response()
            ->setStatusCode($subscription->wasRecentlyCreated ? 201 : 200);
    }

    public function destroy(Request $request, PushSubscription $pushSubscription): JsonResponse
    {
        abort_unless($pushSubscription->account_id === $request->user()->id, 404);

        $pushSubscription->forceFill([
            'permission_status' => 'denied',
            'revoked_at' => now(),
        ])->save();

        return response()->json(status: 204);
    }

    public function destroyCurrent(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'endpoint' => ['required', 'url', 'max:2048'],
        ]);

        $endpointHash = hash('sha256', $validated['endpoint']);

        $subscription = PushSubscription::query()
            ->where('account_id', $request->user()->id)
            ->where('endpoint_hash', $endpointHash)
            ->first();

        if ($subscription) {
            $subscription->forceFill([
                'permission_status' => 'denied',
                'revoked_at' => now(),
            ])->save();
        }

        return response()->json(status: 204);
    }
}
