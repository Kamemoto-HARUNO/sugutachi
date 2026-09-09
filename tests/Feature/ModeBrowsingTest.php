<?php

namespace Tests\Feature;

use App\Models\AccountBlock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\Concerns\CreatesDirectMessageFixtures;
use Tests\TestCase;

class ModeBrowsingTest extends TestCase
{
    use CreatesDirectMessageFixtures;
    use RefreshDatabase;

    public function test_cast_can_browse_and_page_without_a_user_address(): void
    {
        $viewer = $this->dual('Viewer');
        $viewer->roleAssignments()->where('role', 'user')->delete();
        $a = $this->dual('Alpha');
        $b = $this->dual('Beta');
        $this->asAccount($viewer)->getJson('/api/public-therapists?limit=1')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.public_id', $a->therapistProfile->public_id)
            ->assertJsonPath('data.0.walking_time_range', null)->assertJsonPath('meta.has_more', true);
        $this->getJson('/api/public-therapists?limit=1&page=2')->assertOk()
            ->assertJsonPath('data.0.public_id', $b->therapistProfile->public_id)->assertJsonPath('meta.has_more', false);
        $this->getJson('/api/public-therapists?q=Beta')->assertOk()->assertJsonCount(1, 'data');
        $this->assertDatabaseCount('location_search_logs', 0);
        $this->assertDatabaseCount('bookings', 0);
    }

    public function test_public_browsing_keeps_block_and_visibility_restrictions(): void
    {
        $viewer = $this->dual('Viewer');
        $blocked = $this->dual('Blocked');
        $hidden = $this->dual('Hidden');
        $hidden->therapistProfile->update(['is_listed' => false]);
        AccountBlock::create(['blocker_account_id' => $blocked->id, 'blocked_account_id' => $viewer->id]);
        $this->asAccount($viewer)->getJson('/api/public-therapists?limit=12')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/public-therapists?page=0')->assertUnprocessable();
    }

    public function test_support_creation_uses_selected_role_and_rejects_unowned_roles(): void
    {
        Mail::fake();
        $viewer = $this->dual('Viewer');
        $viewer->update(['last_active_role' => 'user']);
        $body = ['title' => '活動について', 'category' => 'service', 'message' => '確認をお願いします。', 'requester_role' => 'therapist'];
        $this->asAccount($viewer)->postJson('/api/support/tickets', $body)->assertOk();
        $this->assertDatabaseHas('support_tickets', ['account_id' => $viewer->id, 'requester_role' => 'therapist']);
        $viewer->roleAssignments()->where('role', 'therapist')->update(['status' => 'revoked']);
        $this->postJson('/api/support/tickets', $body)->assertForbidden();
    }
}
