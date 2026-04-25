<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\IdentityVerification;
use App\Models\TherapistProfile;
use App\Models\TherapistTravelRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Tests\TestCase;

class AdminTravelRequestTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_view_note_and_monitor_travel_requests(): void
    {
        [$admin, $sender, $therapist, $profile, $travelRequest] = $this->createAdminTravelRequestFixture();

        TherapistTravelRequest::create([
            'public_id' => 'trv_admin_other',
            'user_account_id' => Account::factory()->create([
                'public_id' => 'acc_travel_request_other_user',
                'display_name' => 'Other Travel User',
            ])->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $profile->id,
            'prefecture' => '大阪府',
            'message_encrypted' => Crypt::encryptString('Other request'),
            'status' => TherapistTravelRequest::STATUS_READ,
            'monitoring_status' => TherapistTravelRequest::MONITORING_STATUS_REVIEWED,
            'created_at' => now()->subDay(),
            'updated_at' => now()->subDay(),
        ]);

        $token = $admin->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->json('GET', '/api/admin/travel-requests', [
                'status' => TherapistTravelRequest::STATUS_UNREAD,
                'prefecture' => '福岡県',
                'sort' => 'created_at',
                'direction' => 'desc',
            ])
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $travelRequest->public_id)
            ->assertJsonPath('data.0.sender.public_id', $sender->public_id)
            ->assertJsonPath('data.0.therapist_profile.public_id', $profile->public_id)
            ->assertJsonPath('data.0.message', '福岡で会える日があれば知らせてほしいです。');

        $this->withToken($token)
            ->getJson("/api/admin/travel-requests/{$travelRequest->public_id}")
            ->assertOk()
            ->assertJsonPath('data.public_id', $travelRequest->public_id)
            ->assertJsonPath('data.monitoring_status', TherapistTravelRequest::MONITORING_STATUS_UNREVIEWED);

        $this->withToken($token)
            ->postJson("/api/admin/travel-requests/{$travelRequest->public_id}/notes", [
                'note' => 'Potential demand cluster for review.',
            ])
            ->assertOk()
            ->assertJsonPath('data.admin_note_count', 1)
            ->assertJsonPath('data.notes.0.note', 'Potential demand cluster for review.');

        $this->withToken($token)
            ->postJson("/api/admin/travel-requests/{$travelRequest->public_id}/monitoring", [
                'monitoring_status' => TherapistTravelRequest::MONITORING_STATUS_UNDER_REVIEW,
                'note' => 'Ops is checking whether sender activity needs follow-up.',
            ])
            ->assertOk()
            ->assertJsonPath('data.monitoring_status', TherapistTravelRequest::MONITORING_STATUS_UNDER_REVIEW)
            ->assertJsonPath('data.monitored_by_admin.public_id', $admin->public_id)
            ->assertJsonPath('data.admin_note_count', 2)
            ->assertJsonPath('data.notes.1.note', 'Ops is checking whether sender activity needs follow-up.');

        $this->withToken($token)
            ->postJson("/api/admin/travel-requests/{$travelRequest->public_id}/suspend-sender", [
                'reason_code' => 'policy_violation',
                'note' => 'Sender was suspended after repeated off-platform solicitation attempts.',
            ])
            ->assertOk()
            ->assertJsonPath('data.public_id', $sender->public_id)
            ->assertJsonPath('data.status', Account::STATUS_SUSPENDED)
            ->assertJsonPath('data.suspension_reason', 'policy_violation');

        $this->withToken($token)
            ->getJson('/api/admin/travel-requests?monitoring_status=escalated&monitored_by_admin_account_id='.$admin->public_id.'&sender_status=suspended&has_notes=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $travelRequest->public_id)
            ->assertJsonPath('data.0.monitoring_status', TherapistTravelRequest::MONITORING_STATUS_ESCALATED)
            ->assertJsonPath('data.0.sender.status', Account::STATUS_SUSPENDED)
            ->assertJsonPath('data.0.sender.suspension_reason', 'policy_violation');

        $this->assertDatabaseHas('accounts', [
            'id' => $sender->id,
            'status' => Account::STATUS_SUSPENDED,
            'suspension_reason' => 'policy_violation',
        ]);

        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'travel_request.view',
            'target_type' => TherapistTravelRequest::class,
            'target_id' => $travelRequest->id,
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'travel_request.note',
            'target_type' => TherapistTravelRequest::class,
            'target_id' => $travelRequest->id,
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'travel_request.monitor',
            'target_type' => TherapistTravelRequest::class,
            'target_id' => $travelRequest->id,
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'account.suspend',
            'target_type' => Account::class,
            'target_id' => $sender->id,
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'travel_request.suspend_sender',
            'target_type' => TherapistTravelRequest::class,
            'target_id' => $travelRequest->id,
        ]);
    }

    public function test_non_admin_cannot_access_travel_request_admin_api(): void
    {
        [, $sender, , , $travelRequest] = $this->createAdminTravelRequestFixture();
        $token = $sender->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/admin/travel-requests')
            ->assertForbidden();

        $this->withToken($token)
            ->getJson("/api/admin/travel-requests/{$travelRequest->public_id}")
            ->assertForbidden();

        $this->withToken($token)
            ->postJson("/api/admin/travel-requests/{$travelRequest->public_id}/notes", [
                'note' => 'Should fail.',
            ])
            ->assertForbidden();

        $this->withToken($token)
            ->postJson("/api/admin/travel-requests/{$travelRequest->public_id}/monitoring", [
                'monitoring_status' => TherapistTravelRequest::MONITORING_STATUS_UNDER_REVIEW,
            ])
            ->assertForbidden();

        $this->withToken($token)
            ->postJson("/api/admin/travel-requests/{$travelRequest->public_id}/suspend-sender", [
                'reason_code' => 'policy_violation',
            ])
            ->assertForbidden();
    }

    private function createAdminTravelRequestFixture(): array
    {
        $admin = Account::factory()->create(['public_id' => 'acc_admin_travel_requests']);
        $admin->roleAssignments()->create([
            'role' => 'admin',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        $sender = Account::factory()->create([
            'public_id' => 'acc_travel_request_sender',
            'display_name' => 'Travel Sender',
            'email' => 'travel-sender@example.com',
        ]);
        $therapist = Account::factory()->create([
            'public_id' => 'acc_travel_request_therapist',
            'display_name' => 'Travel Therapist',
            'email' => 'travel-therapist@example.com',
        ]);

        IdentityVerification::create([
            'account_id' => $therapist->id,
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);

        $profile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_admin_travel_request',
            'public_name' => 'Travel Request Therapist',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'photo_review_status' => 'approved',
        ]);

        $travelRequest = TherapistTravelRequest::create([
            'public_id' => 'trv_admin_review_case',
            'user_account_id' => $sender->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $profile->id,
            'prefecture' => '福岡県',
            'message_encrypted' => Crypt::encryptString('福岡で会える日があれば知らせてほしいです。'),
            'detected_contact_exchange' => true,
            'status' => TherapistTravelRequest::STATUS_UNREAD,
            'monitoring_status' => TherapistTravelRequest::MONITORING_STATUS_UNREVIEWED,
        ]);

        return [$admin, $sender, $therapist, $profile, $travelRequest];
    }
}
