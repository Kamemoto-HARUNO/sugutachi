<?php

namespace Database\Seeders;

use App\Models\Account;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Account::factory(10)->create();

        Account::factory()->create([
            'display_name' => 'Test Account',
            'email' => 'test@example.com',
        ]);
    }
}
