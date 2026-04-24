<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\LegalAcceptanceResource;
use App\Http\Resources\PublicLegalDocumentResource;
use App\Models\LegalAcceptance;
use App\Models\LegalDocument;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class LegalDocumentController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        $documents = LegalDocument::query()
            ->published()
            ->orderBy('document_type')
            ->orderByDesc('effective_at')
            ->orderByDesc('published_at')
            ->orderByDesc('id')
            ->get()
            ->unique('document_type')
            ->values();

        return PublicLegalDocumentResource::collection($documents);
    }

    public function showLatest(string $type): PublicLegalDocumentResource
    {
        $document = LegalDocument::query()
            ->published()
            ->where('document_type', $type)
            ->orderByDesc('effective_at')
            ->orderByDesc('published_at')
            ->orderByDesc('id')
            ->firstOrFail();

        return new PublicLegalDocumentResource($document);
    }

    public function accept(Request $request, LegalDocument $legalDocument): JsonResponse
    {
        abort_unless($legalDocument->isPublished(), 404);

        $acceptance = LegalAcceptance::query()->firstOrCreate(
            [
                'account_id' => $request->user()->id,
                'legal_document_id' => $legalDocument->id,
            ],
            [
                'accepted_at' => now(),
                'ip_hash' => $request->ip() ? hash('sha256', $request->ip()) : null,
                'user_agent_hash' => $request->userAgent() ? hash('sha256', $request->userAgent()) : null,
            ]
        );
        $acceptance->load('legalDocument');

        return (new LegalAcceptanceResource($acceptance))
            ->response()
            ->setStatusCode($acceptance->wasRecentlyCreated ? 201 : 200);
    }
}
