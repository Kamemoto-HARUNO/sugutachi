<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Api\Concerns\RecordsAdminAuditLogs;
use App\Http\Controllers\Api\Concerns\ResolvesAdminFilterIds;
use App\Http\Controllers\Api\Concerns\SuspendsAccounts;
use App\Http\Controllers\Controller;
use App\Http\Resources\AdminAccountResource;
use App\Http\Resources\AdminTravelRequestResource;
use App\Models\Account;
use App\Models\AdminNote;
use App\Models\AppNotification;
use App\Models\TherapistTravelRequest;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Validation\Rule;

class AdminTravelRequestController extends Controller
{
    use AuthorizesAdminRequests;
    use RecordsAdminAuditLogs;
    use ResolvesAdminFilterIds;
    use SuspendsAccounts;

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorizeAdmin($request->user());

        $validated = $request->validate([
            'user_account_id' => ['nullable', 'string', 'max:36'],
            'sender_status' => ['nullable', Rule::in([Account::STATUS_ACTIVE, Account::STATUS_SUSPENDED])],
            'has_sender_warning' => ['nullable', 'boolean'],
            'sender_restriction_status' => ['nullable', Rule::in(['restricted', 'clear'])],
            'therapist_account_id' => ['nullable', 'string', 'max:36'],
            'therapist_profile_id' => ['nullable', 'string', 'max:36'],
            'status' => ['nullable', Rule::in(TherapistTravelRequest::statuses())],
            'monitoring_status' => ['nullable', Rule::in(TherapistTravelRequest::supportedMonitoringStatuses())],
            'monitored_by_admin_account_id' => ['nullable', 'string', 'max:36'],
            'prefecture' => ['nullable', 'string', 'max:50'],
            'has_notes' => ['nullable', 'boolean'],
            'detected_contact_exchange' => ['nullable', 'boolean'],
            'submitted_from' => ['nullable', 'date'],
            'submitted_to' => ['nullable', 'date'],
            'q' => ['nullable', 'string', 'max:100'],
            'sort' => ['nullable', Rule::in(['created_at', 'read_at', 'archived_at', 'monitored_at', 'prefecture'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
        ]);

        $userAccountId = $this->resolveAccountId($validated['user_account_id'] ?? null);
        $therapistAccountId = $this->resolveAccountId($validated['therapist_account_id'] ?? null);
        $therapistProfileId = $this->resolveTherapistProfileId($validated['therapist_profile_id'] ?? null);
        $monitoredByAdminId = $this->resolveAccountId($validated['monitored_by_admin_account_id'] ?? null);
        $sort = $validated['sort'] ?? 'created_at';
        $direction = $validated['direction'] ?? 'desc';

        return AdminTravelRequestResource::collection(
            TherapistTravelRequest::query()
                ->with(['userAccount', 'therapistProfile.account', 'monitoredByAdmin'])
                ->withCount('adminNotes')
                ->when($userAccountId, fn ($query, int $id) => $query->where('user_account_id', $id))
                ->when(
                    $validated['sender_status'] ?? null,
                    fn ($query, string $status) => $query->whereHas('userAccount', fn ($account) => $account->where('status', $status))
                )
                ->when(
                    array_key_exists('has_sender_warning', $validated),
                    fn ($query) => $validated['has_sender_warning']
                        ? $query->whereHas('userAccount', fn ($account) => $account->where('travel_request_warning_count', '>', 0))
                        : $query->whereHas('userAccount', fn ($account) => $account->where('travel_request_warning_count', 0))
                )
                ->when(
                    $validated['sender_restriction_status'] ?? null,
                    fn ($query, string $restrictionStatus) => $restrictionStatus === 'restricted'
                        ? $query->whereHas('userAccount', fn ($account) => $account->where('travel_request_restricted_until', '>', now()))
                        : $query->whereHas('userAccount', fn ($account) => $account->where(function ($account) {
                            $account
                                ->whereNull('travel_request_restricted_until')
                                ->orWhere('travel_request_restricted_until', '<=', now());
                        }))
                )
                ->when($therapistAccountId, fn ($query, int $id) => $query->where('therapist_account_id', $id))
                ->when($therapistProfileId, fn ($query, int $id) => $query->where('therapist_profile_id', $id))
                ->when($validated['status'] ?? null, fn ($query, string $status) => $query->where('status', $status))
                ->when(
                    $validated['monitoring_status'] ?? null,
                    fn ($query, string $status) => $query->where('monitoring_status', $status)
                )
                ->when(
                    $monitoredByAdminId,
                    fn ($query, int $id) => $query->where('monitored_by_admin_account_id', $id)
                )
                ->when($validated['prefecture'] ?? null, fn ($query, string $prefecture) => $query->where('prefecture', $prefecture))
                ->when(
                    array_key_exists('has_notes', $validated),
                    fn ($query) => $validated['has_notes']
                        ? $query->whereHas('adminNotes')
                        : $query->whereDoesntHave('adminNotes')
                )
                ->when(
                    array_key_exists('detected_contact_exchange', $validated),
                    fn ($query) => $query->where('detected_contact_exchange', (bool) $validated['detected_contact_exchange'])
                )
                ->when($validated['submitted_from'] ?? null, fn ($query, string $date) => $query->whereDate('created_at', '>=', $date))
                ->when($validated['submitted_to'] ?? null, fn ($query, string $date) => $query->whereDate('created_at', '<=', $date))
                ->when($validated['q'] ?? null, function ($query, string $term): void {
                    $query->where(function ($query) use ($term): void {
                        $query
                            ->where('public_id', $term)
                            ->orWhere('prefecture', 'like', "%{$term}%")
                            ->orWhereHas('userAccount', fn ($account) => $account
                                ->where('public_id', $term)
                                ->orWhere('email', 'like', "%{$term}%")
                                ->orWhere('display_name', 'like', "%{$term}%"))
                            ->orWhereHas('therapistProfile', fn ($profile) => $profile
                                ->where('public_id', $term)
                                ->orWhere('public_name', 'like', "%{$term}%")
                                ->orWhereHas('account', fn ($account) => $account
                                    ->where('public_id', $term)
                                    ->orWhere('email', 'like', "%{$term}%")
                                    ->orWhere('display_name', 'like', "%{$term}%")));
                    });
                })
                ->orderBy($sort, $direction)
                ->orderBy('id', $direction)
                ->get()
        );
    }

    public function show(Request $request, TherapistTravelRequest $travelRequest): AdminTravelRequestResource
    {
        $this->authorizeAdmin($request->user());
        $travelRequest = $this->loadAdminTravelRequest($travelRequest);

        $this->recordAdminAudit(
            $request,
            'travel_request.view',
            $travelRequest,
            [],
            $this->snapshot($travelRequest)
        );

        return new AdminTravelRequestResource($travelRequest);
    }

    public function note(Request $request, TherapistTravelRequest $travelRequest): AdminTravelRequestResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);

        $validated = $request->validate([
            'note' => ['required', 'string', 'max:2000'],
        ]);
        $before = $this->snapshot($travelRequest);

        $travelRequest->adminNotes()->create([
            'author_account_id' => $admin->id,
            'note_encrypted' => Crypt::encryptString($validated['note']),
        ]);

        $this->recordAdminAudit(
            $request,
            'travel_request.note',
            $travelRequest,
            $before,
            $this->snapshot($travelRequest->fresh())
        );

        return new AdminTravelRequestResource($this->loadAdminTravelRequest($travelRequest->fresh()));
    }

    public function monitor(Request $request, TherapistTravelRequest $travelRequest): AdminTravelRequestResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);

        $validated = $request->validate([
            'monitoring_status' => ['required', Rule::in(TherapistTravelRequest::supportedMonitoringStatuses())],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);
        $before = $this->snapshot($travelRequest);

        $travelRequest->forceFill([
            'monitoring_status' => $validated['monitoring_status'],
            'monitored_by_admin_account_id' => $admin->id,
            'monitored_at' => now(),
        ])->save();

        if (filled($validated['note'] ?? null)) {
            $travelRequest->adminNotes()->create([
                'author_account_id' => $admin->id,
                'note_encrypted' => Crypt::encryptString($validated['note']),
            ]);
        }

        $this->recordAdminAudit(
            $request,
            'travel_request.monitor',
            $travelRequest,
            $before,
            $this->snapshot($travelRequest->fresh())
        );

        return new AdminTravelRequestResource($this->loadAdminTravelRequest($travelRequest->fresh()));
    }

    public function warnSender(Request $request, TherapistTravelRequest $travelRequest): AdminAccountResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);

        $travelRequest->loadMissing('userAccount');
        $sender = $travelRequest->userAccount;
        abort_unless($sender, 409, 'Sender account is unavailable.');

        $validated = $request->validate([
            'reason_code' => ['required', 'string', 'max:100'],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);
        $accountBefore = $this->snapshotAccount($sender);
        $travelRequestBefore = $this->snapshot($travelRequest);

        $sender->forceFill([
            'travel_request_warning_count' => (int) $sender->travel_request_warning_count + 1,
            'travel_request_last_warned_at' => now(),
            'travel_request_last_warning_reason' => $validated['reason_code'],
        ])->save();

        $travelRequest->forceFill([
            'monitoring_status' => $travelRequest->monitoring_status === TherapistTravelRequest::MONITORING_STATUS_ESCALATED
                ? TherapistTravelRequest::MONITORING_STATUS_ESCALATED
                : TherapistTravelRequest::MONITORING_STATUS_REVIEWED,
            'monitored_by_admin_account_id' => $admin->id,
            'monitored_at' => now(),
        ])->save();

        $this->appendAdminNote($travelRequest, $admin, $validated['note'] ?? null);
        $this->notifySenderWarning($sender->refresh(), $travelRequest, $validated['reason_code']);

        $this->recordAdminAudit(
            $request,
            'account.travel_request_warn',
            $sender,
            $accountBefore,
            $this->snapshotAccount($sender->refresh())
        );
        $this->recordAdminAudit(
            $request,
            'travel_request.warn_sender',
            $travelRequest,
            $travelRequestBefore,
            $this->snapshot($travelRequest->fresh())
        );

        return new AdminAccountResource($sender->load([
            'roleAssignments',
            'latestIdentityVerification',
            'userProfile',
            'therapistProfile',
        ]));
    }

    public function restrictSender(Request $request, TherapistTravelRequest $travelRequest): AdminAccountResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);

        $travelRequest->loadMissing('userAccount');
        $sender = $travelRequest->userAccount;
        abort_unless($sender, 409, 'Sender account is unavailable.');

        $validated = $request->validate([
            'reason_code' => ['required', 'string', 'max:100'],
            'restricted_until' => ['required', 'date', 'after:now'],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);
        $accountBefore = $this->snapshotAccount($sender);
        $travelRequestBefore = $this->snapshot($travelRequest);

        $sender->forceFill([
            'travel_request_restricted_until' => $validated['restricted_until'],
            'travel_request_restriction_reason' => $validated['reason_code'],
        ])->save();

        $travelRequest->forceFill([
            'monitoring_status' => TherapistTravelRequest::MONITORING_STATUS_ESCALATED,
            'monitored_by_admin_account_id' => $admin->id,
            'monitored_at' => now(),
        ])->save();

        $this->appendAdminNote($travelRequest, $admin, $validated['note'] ?? null);
        $this->notifySenderRestriction($sender->refresh(), $travelRequest, $validated['reason_code']);

        $this->recordAdminAudit(
            $request,
            'account.travel_request_restrict',
            $sender,
            $accountBefore,
            $this->snapshotAccount($sender->refresh())
        );
        $this->recordAdminAudit(
            $request,
            'travel_request.restrict_sender',
            $travelRequest,
            $travelRequestBefore,
            $this->snapshot($travelRequest->fresh())
        );

        return new AdminAccountResource($sender->load([
            'roleAssignments',
            'latestIdentityVerification',
            'userProfile',
            'therapistProfile',
        ]));
    }

    public function suspendSender(Request $request, TherapistTravelRequest $travelRequest): AdminAccountResource
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);

        $travelRequest->loadMissing('userAccount');
        $sender = $travelRequest->userAccount;
        abort_unless($sender, 409, 'Sender account is unavailable.');

        $validated = $request->validate([
            'reason_code' => ['required', 'string', 'max:100'],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);
        $accountBefore = $this->snapshotAccount($sender);
        $travelRequestBefore = $this->snapshot($travelRequest);

        $this->suspendAccount($sender, $admin, $validated['reason_code']);

        $travelRequest->forceFill([
            'monitoring_status' => TherapistTravelRequest::MONITORING_STATUS_ESCALATED,
            'monitored_by_admin_account_id' => $admin->id,
            'monitored_at' => now(),
        ])->save();

        $this->appendAdminNote($travelRequest, $admin, $validated['note'] ?? null);

        $this->recordAdminAudit(
            $request,
            'account.suspend',
            $sender,
            $accountBefore,
            $this->snapshotAccount($sender->refresh())
        );
        $this->recordAdminAudit(
            $request,
            'travel_request.suspend_sender',
            $travelRequest,
            $travelRequestBefore,
            $this->snapshot($travelRequest->fresh())
        );

        return new AdminAccountResource($sender->load([
            'roleAssignments',
            'latestIdentityVerification',
            'userProfile',
            'therapistProfile',
        ]));
    }

    private function loadAdminTravelRequest(TherapistTravelRequest $travelRequest): TherapistTravelRequest
    {
        return $travelRequest->load([
            'userAccount',
            'therapistProfile.account',
            'monitoredByAdmin',
            'adminNotes.author',
        ])->loadCount('adminNotes');
    }

    private function snapshot(TherapistTravelRequest $travelRequest): array
    {
        return array_merge(
            $travelRequest->only([
                'id',
                'public_id',
                'user_account_id',
                'therapist_account_id',
                'therapist_profile_id',
                'prefecture',
                'status',
                'monitoring_status',
                'detected_contact_exchange',
                'monitored_by_admin_account_id',
                'monitored_at',
                'read_at',
                'archived_at',
            ]),
            [
                'admin_note_count' => AdminNote::query()
                    ->where('target_type', TherapistTravelRequest::class)
                    ->where('target_id', $travelRequest->id)
                    ->count(),
            ],
        );
    }

    private function snapshotAccount(Account $account): array
    {
        return $account->only([
            'id',
            'public_id',
            'email',
            'phone_e164',
            'display_name',
            'status',
            'last_active_role',
            'suspended_at',
            'suspension_reason',
            'travel_request_warning_count',
            'travel_request_last_warned_at',
            'travel_request_last_warning_reason',
            'travel_request_restricted_until',
            'travel_request_restriction_reason',
        ]);
    }

    private function appendAdminNote(TherapistTravelRequest $travelRequest, Account $admin, ?string $note): void
    {
        if (! filled($note)) {
            return;
        }

        $travelRequest->adminNotes()->create([
            'author_account_id' => $admin->id,
            'note_encrypted' => Crypt::encryptString($note),
        ]);
    }

    private function notifySenderWarning(Account $sender, TherapistTravelRequest $travelRequest, string $reasonCode): void
    {
        AppNotification::create([
            'account_id' => $sender->id,
            'notification_type' => 'travel_request_warning',
            'channel' => 'in_app',
            'title' => '出張リクエスト送信に関する注意',
            'body' => '送信内容がガイドラインに抵触する可能性があるため、出張リクエストの利用に注意してください。',
            'data_json' => [
                'travel_request_id' => $travelRequest->public_id,
                'reason_code' => $reasonCode,
                'warning_count' => (int) $sender->travel_request_warning_count,
                'target_path' => '/contact',
            ],
            'status' => AppNotification::STATUS_SENT,
            'sent_at' => now(),
        ]);
    }

    private function notifySenderRestriction(Account $sender, TherapistTravelRequest $travelRequest, string $reasonCode): void
    {
        AppNotification::create([
            'account_id' => $sender->id,
            'notification_type' => 'travel_request_restricted',
            'channel' => 'in_app',
            'title' => '出張リクエスト送信制限',
            'body' => 'ガイドライン確認のため、出張リクエストの送信を一時停止しました。',
            'data_json' => [
                'travel_request_id' => $travelRequest->public_id,
                'reason_code' => $reasonCode,
                'restricted_until' => $sender->travel_request_restricted_until?->toIso8601String(),
                'target_path' => '/contact',
            ],
            'status' => AppNotification::STATUS_SENT,
            'sent_at' => now(),
        ]);
    }
}
