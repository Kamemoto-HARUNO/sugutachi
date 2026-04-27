<?php

namespace Database\Seeders;

use App\Models\Account;
use App\Models\AccountRole;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class AdminSeeder extends Seeder
{
    public function run(): void
    {
        $email = Str::lower(trim((string) env('ADMIN_SEED_EMAIL', 'admin@sugutachi.local')));
        $password = (string) env('ADMIN_SEED_PASSWORD', 'password');
        $displayName = trim((string) env('ADMIN_SEED_NAME', 'ローカル管理者'));

        if ($email === '') {
            $email = 'admin@sugutachi.local';
        }

        if ($password === '') {
            $password = 'password';
        }

        if ($displayName === '') {
            $displayName = 'ローカル管理者';
        }

        $account = Account::query()
            ->where('public_id', 'acc_seed_admin')
            ->orWhere('email', $email)
            ->first() ?? new Account();

        $account->forceFill([
            'public_id' => $account->public_id ?: 'acc_seed_admin',
            'email' => $email,
            'email_verified_at' => now(),
            'password' => $password,
            'display_name' => $displayName,
            'status' => Account::STATUS_ACTIVE,
            'last_active_role' => 'admin',
        ])->save();

        $assignment = AccountRole::query()->firstOrNew([
            'account_id' => $account->id,
            'role' => 'admin',
        ]);
        $assignment->forceFill([
            'status' => 'active',
            'granted_at' => now()->subWeek(),
            'revoked_at' => null,
        ])->save();

        $this->command?->info('Local admin account is ready:');
        $this->command?->table(
            ['Role', 'Email', 'Password', 'Notes'],
            [
                ['管理者', $email, $password, '管理画面 /admin/login 用'],
            ],
        );
    }
}
