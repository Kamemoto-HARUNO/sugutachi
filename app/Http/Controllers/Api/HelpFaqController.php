<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class HelpFaqController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $faqs = Collection::make(config('help.faqs', []))
            ->map(fn (array $faq): array => [
                'id' => $faq['id'],
                'category' => $faq['category'],
                'question' => $faq['question'],
                'answer' => $faq['answer'],
                'sort_order' => $faq['sort_order'] ?? 0,
            ])
            ->sortBy('sort_order')
            ->values();

        return response()->json([
            'data' => $faqs,
        ]);
    }
}
