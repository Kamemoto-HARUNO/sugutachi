<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AccountResource;
use App\Models\Account;
use App\Models\LegalDocument;
use App\Services\Legal\DefaultLegalDocumentService;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(
        private readonly DefaultLegalDocumentService $defaultLegalDocumentService,
    ) {}

    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email:rfc', 'max:255', 'unique:accounts,email'],
            'phone_e164' => ['nullable', 'string', 'max:32', 'regex:/^\+[1-9]\d{7,14}$/', 'unique:accounts,phone_e164'],
            'password' => ['required', 'string', 'min:10', 'confirmed'],
            'display_name' => ['nullable', 'string', 'max:80'],
            'initial_role' => ['nullable', Rule::in(['user', 'therapist'])],
            'accepted_terms_version' => ['required', 'string', 'max:50'],
            'accepted_privacy_version' => ['required', 'string', 'max:50'],
            'is_over_18' => ['accepted'],
            'relaxation_purpose_agreed' => ['accepted'],
        ]);

        $role = $validated['initial_role'] ?? 'user';
        $acceptedDocuments = $this->resolveAcceptedRegistrationDocuments($validated);

        $account = DB::transaction(function () use ($request, $validated, $role, $acceptedDocuments): Account {
            $account = Account::create([
                'public_id' => 'acc_'.Str::ulid(),
                'email' => Str::lower($validated['email']),
                'phone_e164' => $validated['phone_e164'] ?? null,
                'password' => $validated['password'],
                'display_name' => $validated['display_name'] ?? null,
                'status' => 'active',
                'last_active_role' => $role,
                'registered_ip_hash' => $request->ip() ? hash('sha256', $request->ip()) : null,
            ]);

            $account->roleAssignments()->create([
                'role' => $role,
                'status' => 'active',
                'granted_at' => now(),
            ]);

            if ($role === 'therapist') {
                $account->ensureTherapistProfile();
            }

            $acceptedDocuments->each(fn (LegalDocument $document) => $account->legalAcceptances()->create([
                'legal_document_id' => $document->id,
                'accepted_at' => now(),
                'ip_hash' => $request->ip() ? hash('sha256', $request->ip()) : null,
                'user_agent_hash' => $request->userAgent() ? hash('sha256', $request->userAgent()) : null,
            ]));

            return $account;
        });

        return $this->tokenResponse($account, 201);
    }

    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $account = Account::query()
            ->where('email', Str::lower($validated['email']))
            ->first();

        if (! $account || ! Hash::check($validated['password'], $account->password)) {
            throw ValidationException::withMessages([
                'email' => __('auth.failed'),
            ]);
        }

        if ($account->status !== 'active') {
            abort(403, 'このアカウントは現在利用できません。');
        }

        $account->forceFill(['last_login_at' => now()])->save();

        return $this->tokenResponse($account);
    }

    public function me(Request $request): AccountResource
    {
        return new AccountResource(
            $request->user()->load(['roleAssignments', 'latestIdentityVerification'])
        );
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->tokens()->delete();

        return response()->json(null, 204);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email:rfc'],
            'password' => ['required', 'string', 'min:10', 'confirmed'],
        ]);

        $status = Password::broker()->reset(
            [
                'email' => Str::lower($validated['email']),
                'password' => $validated['password'],
                'password_confirmation' => (string) $request->input('password_confirmation'),
                'token' => $validated['token'],
            ],
            function (Account $account, string $password): void {
                $account->forceFill([
                    'password' => $password,
                    'remember_token' => Str::random(60),
                ])->save();
            }
        );

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages([
                'email' => ['再設定リンクの有効期限が切れているか、内容が正しくありません。もう一度再設定メールを送ってください。'],
            ]);
        }

        return response()->json([
            'message' => 'パスワードを再設定しました。',
            'status' => 'password_reset',
        ]);
    }

    private function tokenResponse(Account $account, int $status = 200): JsonResponse
    {
        $token = $account->createToken('api')->plainTextToken;

        return response()->json([
            'token_type' => 'Bearer',
            'access_token' => $token,
            'account' => new AccountResource($account->load(['roleAssignments', 'latestIdentityVerification'])),
        ], $status);
    }

    private function resolveAcceptedRegistrationDocuments(array $validated): Collection
    {
        $this->defaultLegalDocumentService->ensurePublished(['terms', 'privacy']);

        $documents = LegalDocument::query()
            ->published()
            ->where(function ($query) use ($validated): void {
                $query
                    ->where(fn ($query) => $query
                        ->where('document_type', 'terms')
                        ->where('version', $validated['accepted_terms_version']))
                    ->orWhere(fn ($query) => $query
                        ->where('document_type', 'privacy')
                        ->where('version', $validated['accepted_privacy_version']));
            })
            ->get()
            ->keyBy('document_type');

        $errors = [];

        if (! $documents->has('terms')) {
            $errors['accepted_terms_version'] = ['選択された利用規約の版が無効です。'];
        }

        if (! $documents->has('privacy')) {
            $errors['accepted_privacy_version'] = ['選択されたプライバシーポリシーの版が無効です。'];
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        return $documents->values();
    }
}
