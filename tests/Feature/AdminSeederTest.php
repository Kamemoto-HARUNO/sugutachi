<?php

namespace Tests\Feature;

use App\Models\Account;
use Database\Seeders\AdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_seeder_creates_active_admin_account(): void
    {
        $this->seed(AdminSeeder::class);

        $account = Account::query()
            ->where('public_id', 'acc_seed_admin')
            ->first();

        $this->assertNotNull($account);
        $this->assertSame('admin@sugutachi.local', $account->email);
        $this->assertSame('ローカル管理者', $account->display_name);
        $this->assertSame(Account::STATUS_ACTIVE, $account->status);
        $this->assertSame('admin', $account->last_active_role);
        $this->assertTrue(Hash::check('password', $account->password));
        $this->assertDatabaseHas('account_roles', [
            'account_id' => $account->id,
            'role' => 'admin',
            'status' => 'active',
            'revoked_at' => null,
        ]);
    }
}
