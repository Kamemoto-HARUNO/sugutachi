<?php

namespace Database\Factories;

use App\Models\Account;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<Account>
 */
class AccountFactory extends Factory
{
    protected static ?string $password;

    public function definition(): array
    {
        return [
            'public_id' => 'acc_'.Str::ulid(),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'phone_e164' => null,
            'password' => static::$password ??= Hash::make('password'),
            'display_name' => fake()->name(),
            'status' => 'active',
            'last_active_role' => 'user',
            'remember_token' => Str::random(10),
        ];
    }

    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }
}
