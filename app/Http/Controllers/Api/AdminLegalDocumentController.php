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
use Illuminate\Support\Facades\DB;
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
                ->withCount(['acceptances', 'bookingConsents'])
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

        $document = DB::transaction(function () use ($validated, $publishedAt, $effectiveAt): LegalDocument {
            $document = LegalDocument::create([
                'public_id' => 'ldoc_'.Str::ulid(),
                'document_type' => $validated['document_type'],
                'version' => $validated['version'],
                'title' => $validated['title'],
                'body' => $validated['body'],
                'published_at' => $publishedAt,
                'effective_at' => $effectiveAt,
            ]);

            $this->unpublishOtherVersions($document->document_type, $document->id);

            return $document;
        });

        $document->loadCount(['acceptances', 'bookingConsents']);
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
            '公開中の法務文書は更新できません。新しいバージョンを作成してください。'
        );

        $validated = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'body' => ['sometimes', 'required', 'string'],
            'published_at' => ['nullable', 'date'],
            'effective_at' => ['nullable', 'date'],
        ]);

        if ($validated === []) {
            throw ValidationException::withMessages([
                'title' => ['少なくとも1項目は変更してください。'],
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

        DB::transaction(function () use ($validated, $publishedAt, $effectiveAt, $legalDocument): void {
            $legalDocument->forceFill([
                'title' => $validated['title'] ?? $legalDocument->title,
                'body' => $validated['body'] ?? $legalDocument->body,
                'published_at' => $publishedAt,
                'effective_at' => $effectiveAt,
            ])->save();

            $this->unpublishOtherVersions($legalDocument->document_type, $legalDocument->id);
        });

        $legalDocument->loadCount(['acceptances', 'bookingConsents']);
        $this->recordAdminAudit(
            $request,
            'legal_document.update',
            $legalDocument,
            $before,
            $this->snapshot($legalDocument->refresh()->loadCount(['acceptances', 'bookingConsents']))
        );

        return new LegalDocumentResource($legalDocument);
    }

    public function destroy(Request $request, LegalDocument $legalDocument): JsonResponse
    {
        $this->authorizeAdmin($request->user());

        $legalDocument->loadCount(['acceptances', 'bookingConsents']);

        abort_if(
            (($legalDocument->acceptances_count ?? 0) + ($legalDocument->booking_consents_count ?? 0)) > 0,
            409,
            '承諾履歴がある文書は削除できません。'
        );

        $before = $this->snapshot($legalDocument);

        $legalDocument->delete();

        $this->recordAdminAudit(
            $request,
            'legal_document.delete',
            $legalDocument,
            $before,
            []
        );

        return response()->json([
            'message' => '法務文書を削除しました。',
        ]);
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
                'effective_at' => ['効力発生日は公開日時以降に設定してください。'],
            ]);
        }

        return [$publishedAt, $effectiveAt];
    }

    private function unpublishOtherVersions(string $documentType, int $currentDocumentId): void
    {
        LegalDocument::query()
            ->where('document_type', $documentType)
            ->whereKeyNot($currentDocumentId)
            ->whereNotNull('published_at')
            ->update([
                'published_at' => null,
            ]);
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
