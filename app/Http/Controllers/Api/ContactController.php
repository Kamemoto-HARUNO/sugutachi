<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ContactInquiryResource;
use App\Models\ContactInquiry;
use App\Services\Notifications\AdminNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ContactController extends Controller
{
    public function store(Request $request, AdminNotificationService $adminNotificationService): JsonResponse
    {
        $account = $request->user('sanctum');

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => $account
                ? ['nullable', 'email:rfc', 'max:255']
                : ['required', 'email:rfc', 'max:255'],
            'category' => ['required', Rule::in(['service', 'account', 'booking', 'payment', 'safety', 'other'])],
            'message' => ['required', 'string', 'min:10', 'max:5000'],
        ]);

        $email = $validated['email'] ?? $account?->email;

        if (blank($email)) {
            throw ValidationException::withMessages([
                'email' => 'お問い合わせを受け付けるには返信先メールアドレスが必要です。',
            ]);
        }

        $inquiry = ContactInquiry::create([
            'public_id' => 'ctc_'.Str::ulid(),
            'account_id' => $account?->id,
            'name' => $validated['name'],
            'email' => $email,
            'category' => $validated['category'],
            'message' => $validated['message'],
            'status' => ContactInquiry::STATUS_PENDING,
            'source' => $account ? ContactInquiry::SOURCE_AUTHENTICATED : ContactInquiry::SOURCE_GUEST,
            'submitted_ip_hash' => filled($request->ip())
                ? hash('sha256', (string) $request->ip())
                : null,
            'user_agent' => Str::limit((string) $request->userAgent(), 500, ''),
        ]);

        $adminNotificationService->notifyContactInquiryReceived($inquiry);

        return (new ContactInquiryResource($inquiry))
            ->response()
            ->setStatusCode(201);
    }
}
