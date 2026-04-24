<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\ContactInquiry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Tests\TestCase;

class AdminContactInquiryTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_and_view_contact_inquiries(): void
    {
        [$admin, $member, $pendingInquiry] = $this->createInquiryFixture();

        ContactInquiry::create([
            'public_id' => 'ctc_resolved_admin',
            'status' => ContactInquiry::STATUS_RESOLVED,
            'source' => ContactInquiry::SOURCE_GUEST,
            'name' => 'Resolved Guest',
            'email' => 'resolved@example.com',
            'category' => 'other',
            'message' => 'Already handled.',
            'resolved_at' => now(),
        ]);

        $token = $admin->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->getJson("/api/admin/contact-inquiries?status=pending&category=booking&account_id={$member->public_id}&sort=created_at&direction=asc")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $pendingInquiry->public_id)
            ->assertJsonPath('data.0.account.public_id', $member->public_id);

        $this->withToken($token)
            ->getJson("/api/admin/contact-inquiries/{$pendingInquiry->public_id}")
            ->assertOk()
            ->assertJsonPath('data.public_id', $pendingInquiry->public_id)
            ->assertJsonPath('data.message', '予約時刻の変更について相談したいです。')
            ->assertJsonCount(1, 'data.notes')
            ->assertJsonPath('data.notes.0.note', 'First response queued.');

        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'contact_inquiry.view',
            'target_type' => ContactInquiry::class,
            'target_id' => $pendingInquiry->id,
        ]);
    }

    public function test_admin_can_add_note_and_resolve_contact_inquiry(): void
    {
        [$admin, , $pendingInquiry] = $this->createInquiryFixture();
        $token = $admin->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->postJson("/api/admin/contact-inquiries/{$pendingInquiry->public_id}/notes", [
                'note' => 'Called back and confirmed the booking window.',
            ])
            ->assertOk()
            ->assertJsonCount(2, 'data.notes')
            ->assertJsonPath('data.notes.1.note', 'Called back and confirmed the booking window.');

        $this->assertDatabaseHas('admin_notes', [
            'author_account_id' => $admin->id,
            'target_type' => ContactInquiry::class,
            'target_id' => $pendingInquiry->id,
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'contact_inquiry.note',
            'target_type' => ContactInquiry::class,
            'target_id' => $pendingInquiry->id,
        ]);

        $this->withToken($token)
            ->postJson("/api/admin/contact-inquiries/{$pendingInquiry->public_id}/resolve", [
                'resolution_note' => 'Inquiry resolved after schedule adjustment.',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', ContactInquiry::STATUS_RESOLVED)
            ->assertJsonCount(3, 'data.notes')
            ->assertJsonPath('data.notes.2.note', 'Inquiry resolved after schedule adjustment.');

        $this->assertDatabaseHas('contact_inquiries', [
            'id' => $pendingInquiry->id,
            'status' => ContactInquiry::STATUS_RESOLVED,
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'contact_inquiry.resolve',
            'target_type' => ContactInquiry::class,
            'target_id' => $pendingInquiry->id,
        ]);
    }

    public function test_non_admin_cannot_access_contact_inquiry_admin_api(): void
    {
        [, $member, $pendingInquiry] = $this->createInquiryFixture();

        $this->withToken($member->createToken('api')->plainTextToken)
            ->getJson("/api/admin/contact-inquiries/{$pendingInquiry->public_id}")
            ->assertForbidden();
    }

    public function test_admin_can_filter_contact_inquiries_by_notes_and_dates(): void
    {
        [$admin, $member] = $this->createInquiryFixture();

        ContactInquiry::create([
            'public_id' => 'ctc_old_admin',
            'account_id' => $member->id,
            'name' => 'Old Inquiry',
            'email' => 'old@example.com',
            'category' => 'service',
            'message' => 'Older inquiry without notes.',
            'status' => ContactInquiry::STATUS_RESOLVED,
            'source' => ContactInquiry::SOURCE_AUTHENTICATED,
            'resolved_at' => now()->subDay(),
            'created_at' => now()->subDays(3),
            'updated_at' => now()->subDay(),
        ]);

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->getJson('/api/admin/contact-inquiries?has_notes=1&submitted_from='.today()->subDay()->toDateString())
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', 'ctc_pending_admin')
            ->assertJsonPath('data.0.admin_note_count', 1);
    }

    private function createInquiryFixture(): array
    {
        $admin = Account::factory()->create(['public_id' => 'acc_admin_contact']);
        $admin->roleAssignments()->create([
            'role' => 'admin',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        $member = Account::factory()->create([
            'public_id' => 'acc_member_contact',
            'display_name' => 'Member Contact',
            'email' => 'member-contact@example.com',
        ]);

        $pendingInquiry = ContactInquiry::create([
            'public_id' => 'ctc_pending_admin',
            'account_id' => $member->id,
            'name' => '会員ユーザー',
            'email' => 'member-contact@example.com',
            'category' => 'booking',
            'message' => '予約時刻の変更について相談したいです。',
            'status' => ContactInquiry::STATUS_PENDING,
            'source' => ContactInquiry::SOURCE_AUTHENTICATED,
            'submitted_ip_hash' => hash('sha256', '127.0.0.1'),
            'user_agent' => 'PHPUnit',
        ]);

        $pendingInquiry->adminNotes()->create([
            'author_account_id' => $admin->id,
            'note_encrypted' => Crypt::encryptString('First response queued.'),
        ]);

        return [$admin, $member, $pendingInquiry];
    }
}
