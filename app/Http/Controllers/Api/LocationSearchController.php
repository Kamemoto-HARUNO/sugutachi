<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class LocationSearchController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['required', 'string', 'max:160'],
        ]);

        try {
            $response = Http::acceptJson()
                ->withHeaders([
                    'User-Agent' => (string) config('services.nominatim.user_agent'),
                    'Referer' => rtrim((string) config('app.url', 'http://localhost'), '/'),
                ])
                ->timeout(10)
                ->get(rtrim((string) config('services.nominatim.base_url'), '/').'/search', [
                    'q' => $validated['q'],
                    'format' => 'jsonv2',
                    'limit' => 5,
                    'addressdetails' => 1,
                    'countrycodes' => 'jp',
                ]);
        } catch (ConnectionException) {
            return response()->json([
                'message' => '住所検索に失敗しました。しばらくしてからもう一度お試しください。',
            ], 502);
        }

        if ($response->failed()) {
            return response()->json([
                'message' => '住所検索に失敗しました。しばらくしてからもう一度お試しください。',
            ], 502);
        }

        $results = collect($response->json())
            ->filter(fn (mixed $item): bool => is_array($item))
            ->map(fn (array $item): array => [
                'display_name' => (string) ($item['display_name'] ?? $item['name'] ?? ''),
                'lat' => isset($item['lat']) ? (float) $item['lat'] : null,
                'lng' => isset($item['lon']) ? (float) $item['lon'] : null,
            ])
            ->filter(fn (array $item): bool => $item['display_name'] !== '' && $item['lat'] !== null && $item['lng'] !== null)
            ->values()
            ->all();

        return response()->json([
            'data' => $results,
        ]);
    }
}
