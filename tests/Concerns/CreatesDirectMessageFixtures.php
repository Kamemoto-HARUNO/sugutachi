<?php

namespace Tests\Concerns;

use App\Models\Account;
use App\Models\Booking;
use App\Models\IdentityVerification;
use App\Models\ServiceAddress;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Support\Str;

trait CreatesDirectMessageFixtures
{
    protected function dual(string $name): Account
    {
        $account = Account::factory()->create(['display_name' => $name.'利用者']);
        foreach (['user', 'therapist'] as $role) {
            $account->roleAssignments()->create(['role' => $role, 'status' => 'active']);
        }
        IdentityVerification::create(['account_id' => $account->id, 'status' => 'approved', 'is_age_verified' => true]);
        $profile = TherapistProfile::create(['account_id' => $account->id, 'public_id' => 'thp_'.$name, 'public_name' => $name.'キャスト', 'profile_status' => 'approved', 'is_listed' => true, 'consultation_enabled' => true]);
        TherapistMenu::create(['public_id' => 'menu_'.$name, 'therapist_profile_id' => $profile->id, 'name' => '60分', 'duration_minutes' => 60, 'base_price_amount' => 10000, 'is_active' => true]);

        return $account;
    }

    protected function asAccount(Account $account): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($account->createToken('test')->plainTextToken);
    }

    protected function start(Account $from, Account $to, string $key = 'first')
    {
        return $this->asAccount($from)->postJson('/api/user/direct-messages', ['target_therapist_profile_id' => $to->therapistProfile->public_id, 'body' => '事前に質問したいです', 'client_message_id' => $key]);
    }

    protected function booking(Account $user, Account $cast, string $status = 'accepted'): Booking
    {
        $address = ServiceAddress::create(['public_id' => 'addr_'.Str::ulid(), 'account_id' => $user->id, 'place_type' => 'hotel', 'address_line_encrypted' => 'fixture', 'lat' => 35.68, 'lng' => 139.76]);

        return Booking::create(['public_id' => 'book_'.Str::ulid(), 'user_account_id' => $user->id, 'therapist_account_id' => $cast->id, 'therapist_profile_id' => $cast->therapistProfile->id, 'therapist_menu_id' => $cast->therapistProfile->menus()->first()->id, 'service_address_id' => $address->id, 'status' => $status, 'duration_minutes' => 60, 'total_amount' => 12300, 'therapist_net_amount' => 10800, 'platform_fee_amount' => 1200, 'matching_fee_amount' => 300]);
    }
}
