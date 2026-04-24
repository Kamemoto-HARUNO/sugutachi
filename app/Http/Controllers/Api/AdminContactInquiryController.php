<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Api\Concerns\RecordsAdminAuditLogs;
use App\Http\Controllers\Api\Concerns\ResolvesAdminFilterIds;
use App\Http\Controllers\Controller;
use App\Http\Resources\AdminContactInquiryResource;
use App\Models\AdminNote;
use App\Models\ContactInquiry;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Validation\Rule;

class AdminContactInquiryController extends Controller
{
    use AuthorizesAdminRequests;
    use RecordsAdminAuditLogs;
    use ResolvesAdminFilterIds;

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorizeAdmin($request->user());

        $validated = $request->validate([
            'account_id' => ['nullable', 'string', 'max:36'],
            'status' => ['nullable', Rule::in([ContactInquiry::STATUS_PENDING, ContactInquiry::STATUS_RESOLVED])],
            'category' => ['nullable', Rule::in(['service', 'account', 'booking', 'payment', 'safety', 'other'])],
            'source' => ['nullable', Rule::in([ContactInquiry::SOURCE_AUTHENTICATED, ContactInquiry::SOURCE_GUEST])],
            'q' => ['nullable', 'string', 'max:100'],
            'sort' => ['nullable', Rule::in(['created_at', 'resolved_at', 'category'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
        ]);
        $accountId = $this->resolveAccountId($validated['account_id'] ?? null);
        $sort = $validated['sort'] ?? 'created_at';
        $direction = $validated['direction'] ?? 'desc';

        return AdminContactInquiryResource::collection(
            ContactInquiry::query()
                ->with('account')
                ->when($accountId, fn ($query, int $id) => $query->where('account_id', $id))
                ->when($validated['status'] ?? null, fn ($query, string $status) => $query->where('status', $status))
                ->when($validated['category'] ?? null, fn ($query, string $category) => $query->where('category', $category))
                ->when($validated['source'] ?? null, fn ($query, string $source) => $query->where('source', $source))
                ->when($validated['q'] ?? null, fn ($query, string $term) => $query->where(function ($query) use ($term): void {
                    $query
                        ->where('public_id', $term)
                        ->orWhere('name', 'like', "%{$term}%")
                        ->orWhere('email', 'like', "%{$term}%");
                }))
                ->orderBy($sort, $direction)
                ->orderBy('id', $direction)
                ->get()
        );
    }

    public function show(Request $request, ContactInquiry $contactInquiry): AdminContactInquiryResource
    {
        $this->authorizeAdmin($request->user());
        $contactInquiry->load(['account', 'adminNotes.author']);

        $this->recordAdminAudit(
            $request,
            'contact_inquiry.view',
            $contactInquiry,
            [],
            $this->snapshot($contactInquiry)
        );

        return new AdminContactInquiryResource($contactInquiry);
    }

    public function note(Request $request, ContactInquiry $contactInquiry): AdminContactInquiryResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);

        $validated = $request->validate([
            'note' => ['required', 'string', 'max:2000'],
        ]);
        $before = $this->snapshot($contactInquiry);

        $contactInquiry->adminNotes()->create([
            'author_account_id' => $admin->id,
            'note_encrypted' => Crypt::encryptString($validated['note']),
        ]);

        $this->recordAdminAudit(
            $request,
            'contact_inquiry.note',
            $contactInquiry,
            $before,
            $this->snapshot($contactInquiry->fresh())
        );

        return new AdminContactInquiryResource($contactInquiry->fresh()->load(['account', 'adminNotes.author']));
    }

    public function resolve(Request $request, ContactInquiry $contactInquiry): AdminContactInquiryResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);
        abort_unless($contactInquiry->status === ContactInquiry::STATUS_PENDING, 409, 'Only pending inquiries can be resolved.');

        $validated = $request->validate([
            'resolution_note' => ['nullable', 'string', 'max:2000'],
        ]);
        $before = $this->snapshot($contactInquiry);

        $contactInquiry->forceFill([
            'status' => ContactInquiry::STATUS_RESOLVED,
            'resolved_at' => now(),
        ])->save();

        if (filled($validated['resolution_note'] ?? null)) {
            $contactInquiry->adminNotes()->create([
                'author_account_id' => $admin->id,
                'note_encrypted' => Crypt::encryptString($validated['resolution_note']),
            ]);
        }

        $this->recordAdminAudit(
            $request,
            'contact_inquiry.resolve',
            $contactInquiry,
            $before,
            $this->snapshot($contactInquiry->fresh())
        );

        return new AdminContactInquiryResource($contactInquiry->fresh()->load(['account', 'adminNotes.author']));
    }

    private function snapshot(ContactInquiry $contactInquiry): array
    {
        return array_merge(
            $contactInquiry->only([
                'id',
                'public_id',
                'account_id',
                'category',
                'status',
                'source',
                'resolved_at',
            ]),
            [
                'admin_note_count' => AdminNote::query()
                    ->where('target_type', ContactInquiry::class)
                    ->where('target_id', $contactInquiry->id)
                    ->count(),
            ],
        );
    }
}
