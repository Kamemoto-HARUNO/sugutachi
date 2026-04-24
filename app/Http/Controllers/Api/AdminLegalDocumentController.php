<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Api\Concerns\RecordsAdminAuditLogs;
use App\Http\Controllers\Controller;
use App\Http\Resources\LegalDocumentResource;
use App\Models\LegalDocument;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminLegalDocumentController extends Controller
{
    use AuthorizesAdminRequests;
    use RecordsAdminAuditLogs;

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorizeAdmin($request->user());

        $validated = $request->validate([
            'document_type' => ['nullable', 'string', 'max:50'],
            'is_published' => ['nullable', 'boolean'],
        ]);

        return LegalDocumentResource::collection(
            LegalDocument::query()
                ->withCount('acceptances')
                ->when(
                    $validated['document_type'] ?? null,
                    fn ($query, string $documentType) => $query->where('document_type', $documentType)
                )
                ->when(
                    array_key_exists('is_published', $validated),
                    fn ($query) => $validated['is_published']
                        ? $query->whereNotNull('published_at')
                        : $query->whereNull('published_at')
                )
                ->orderBy('document_type')
                ->orderByDesc('effective_at')
                ->orderByDesc('created_at')
                ->get()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);

        $validated = $request->validate([
            'document_type' => ['required', 'string', 'max:50'],
            'version' => [
                'required',
                'string',
                'max:50',
                Rule::unique('legal_documents')->where(
                    fn ($query) => $query->where('document_type', $request->input('document_type'))
                ),
            ],
            'title' => ['required', 'string', 'max:255'],
            'body' => ['required', 'string'],
            'published_at' => ['nullable', 'date'],
            'effective_at' => ['nullable', 'date'],
        ]);

        [$publishedAt, $effectiveAt] = $this->resolvePublicationWindow(
            $validated['published_at'] ?? null,
            $validated['effective_at'] ?? null
        );

        $document = LegalDocument::create([
            'public_id' => 'ldoc_'.Str::ulid(),
            'document_type' => $validated['document_type'],
            'version' => $validated['version'],
            'title' => $validated['title'],
            'body' => $validated['body'],
            'published_at' => $publishedAt,
            'effective_at' => $effectiveAt,
        ]);

        $document->loadCount('acceptances');
        $this->recordAdminAudit($request, 'legal_document.create', $document, [], $this->snapshot($document));

        return (new LegalDocumentResource($document))
            ->response()
            ->setStatusCode(201);
    }

    public function update(Request $request, LegalDocument $legalDocument): LegalDocumentResource
    {
        $this->authorizeAdmin($request->user());
        abort_if(
            $legalDocument->published_at !== null,
            409,
            'Published legal documents cannot be updated. Create a new version instead.'
        );

        $validated = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'body' => ['sometimes', 'required', 'string'],
            'published_at' => ['nullable', 'date'],
            'effective_at' => ['nullable', 'date'],
        ]);

        if ($validated === []) {
            throw ValidationException::withMessages([
                'title' => ['At least one field must be provided.'],
            ]);
        }

        [$publishedAt, $effectiveAt] = $this->resolvePublicationWindow(
            array_key_exists('published_at', $validated)
                ? $validated['published_at']
                : $legalDocument->published_at?->toIso8601String(),
            array_key_exists('effective_at', $validated)
                ? $validated['effective_at']
                : $legalDocument->effective_at?->toIso8601String()
        );
        $before = $this->snapshot($legalDocument);

        $legalDocument->forceFill([
            'title' => $validated['title'] ?? $legalDocument->title,
            'body' => $validated['body'] ?? $legalDocument->body,
            'published_at' => $publishedAt,
            'effective_at' => $effectiveAt,
        ])->save();

        $legalDocument->loadCount('acceptances');
        $this->recordAdminAudit(
            $request,
            'legal_document.update',
            $legalDocument,
            $before,
            $this->snapshot($legalDocument->refresh()->loadCount('acceptances'))
        );

        return new LegalDocumentResource($legalDocument);
    }

    private function resolvePublicationWindow(?string $publishedAtInput, ?string $effectiveAtInput): array
    {
        $publishedAt = filled($publishedAtInput)
            ? CarbonImmutable::parse($publishedAtInput)
            : null;
        $effectiveAt = filled($effectiveAtInput)
            ? CarbonImmutable::parse($effectiveAtInput)
            : null;

        if ($publishedAt && $effectiveAt && $effectiveAt->lt($publishedAt)) {
            throw ValidationException::withMessages([
                'effective_at' => ['The effective at must be after or equal to published at.'],
            ]);
        }

        return [$publishedAt, $effectiveAt];
    }

    private function snapshot(LegalDocument $document): array
    {
        return $document->only([
            'id',
            'public_id',
            'document_type',
            'version',
            'title',
            'body',
            'published_at',
            'effective_at',
        ]);
    }
}
