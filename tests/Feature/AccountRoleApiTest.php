<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\TherapistProfile;
use App\Models\UserProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccountRoleApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_account_can_add_therapist_role_without_creating_a_second_account(): void
    {
        $account = Account::factory()->create([
            'display_name' => 'Dual Mode User',
            'last_active_role' => 'user',
        ]);
        $account->roleAssignments()->create([
            'role' => 'user',
            'status' => 'active',
            'granted_at' => now()->subDay(),
        ]);

        $token = $account->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/me/roles', [
                'role' => 'therapist',
            ])
            ->assertOk()
            ->assertJsonPath('data.last_active_role', 'therapist')
            ->assertJsonPath('meta.active_role', 'therapist')
            ->assertJsonPath('meta.role_added', 'therapist')
            ->assertJsonPath('meta.was_created', true);

        $this->assertDatabaseHas('account_roles', [
            'account_id' => $account->id,
            'role' => 'therapist',
            'status' => 'active',
        ]);
        $this->assertDatabaseHas('therapist_profiles', [
            'account_id' => $account->id,
            'public_name' => 'Dual Mode User',
            'profile_status' => TherapistProfile::STATUS_DRAFT,
        ]);
        $this->assertSame(1, Account::query()->where('email', $account->email)->count());
    }

    public function test_therapist_account_can_add_user_role_without_creating_a_second_account(): void
    {
        $account = Account::factory()->create([
            'last_active_role' => 'therapist',
        ]);
        $account->roleAssignments()->create([
            'role' => 'therapist',
            'status' => 'active',
            'granted_at' => now()->subDay(),
        ]);
        $account->therapistProfile()->create([
            'public_id' => 'thp_test_role_add',
            'public_name' => 'Therapist Only',
            'profile_status' => TherapistProfile::STATUS_DRAFT,
            'training_status' => 'none',
            'photo_review_status' => 'pending',
            'is_online' => false,
        ]);

        $token = $account->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/me/roles', [
                'role' => 'user',
            ])
            ->assertOk()
            ->assertJsonPath('data.last_active_role', 'user')
            ->assertJsonPath('meta.active_role', 'user')
            ->assertJsonPath('meta.role_added', 'user')
            ->assertJsonPath('meta.was_created', true);

        $this->assertDatabaseHas('account_roles', [
            'account_id' => $account->id,
            'role' => 'user',
            'status' => 'active',
        ]);
        $this->assertDatabaseHas('user_profiles', [
            'account_id' => $account->id,
            'profile_status' => UserProfile::STATUS_INCOMPLETE,
        ]);
        $this->assertSame(1, Account::query()->where('email', $account->email)->count());
    }

    public function test_adding_existing_role_is_idempotent(): void
    {
        $account = Account::factory()->create([
            'last_active_role' => 'user',
        ]);
        $account->roleAssignments()->create([
            'role' => 'user',
            'status' => 'active',
            'granted_at' => now()->subDay(),
        ]);
        $account->userProfile()->create([
            'profile_status' => UserProfile::STATUS_INCOMPLETE,
            'disclose_sensitive_profile_to_therapist' => false,
        ]);

        $token = $account->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/me/roles', [
                'role' => 'user',
            ])
            ->assertOk()
            ->assertJsonPath('meta.was_created', false);

        $this->assertSame(1, $account->fresh()->roleAssignments()->where('role', 'user')->count());
        $this->assertSame(1, $account->fresh()->userProfile()->count());
    }
}
