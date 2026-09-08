<?php

namespace Database\Seeders;

use App\Models\Account;
use App\Models\Booking;
use App\Models\IdentityVerification;
use App\Models\ServiceAddress;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use App\Services\DirectMessages\DirectMessageService;
use App\Services\Legal\DefaultLegalDocumentService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Crypt;

class DirectMessagePreviewSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment('local') || config('database.default') !== 'sqlite' || ! str_ends_with(config('database.connections.sqlite.database'), '/dm-preview.sqlite')) {
            throw new \RuntimeException('Only the isolated local DM preview database is supported.');
        }
        app(DefaultLegalDocumentService::class)->ensurePublished(['terms', 'privacy', 'commerce']);
        $accounts = [];
        foreach (['A', 'B'] as $name) {
            $a = Account::firstOrCreate(['email' => 'dm-'.strtolower($name).'@example.test'], ['public_id' => 'acc_dm_preview_'.$name, 'display_name' => '利用者'.$name, 'password' => 'Preview-dm-2026!', 'status' => 'active', 'last_active_role' => 'user']);
            foreach (['user', 'therapist', 'admin'] as $role) {
                $a->roleAssignments()->firstOrCreate(['role' => $role], ['status' => 'active']);
            }
            $a->userProfile()->firstOrCreate(['account_id' => $a->id]);
            IdentityVerification::firstOrCreate(['account_id' => $a->id], ['status' => 'approved', 'is_age_verified' => true]);
            $profile = TherapistProfile::firstOrCreate(['account_id' => $a->id], ['public_id' => 'thp_dm_preview_'.$name, 'public_name' => 'キャスト'.$name, 'profile_status' => 'approved', 'is_listed' => true, 'is_online' => false, 'consultation_enabled' => true]);
            TherapistMenu::firstOrCreate(['therapist_profile_id' => $profile->id], ['public_id' => 'menu_dm_preview_'.$name, 'name' => '60分のメニュー', 'duration_minutes' => 60, 'base_price_amount' => 10000, 'is_active' => true]);
            $accounts[] = $a;
        }
        [$a,$b] = $accounts;
        $messages = app(DirectMessageService::class);
        [$one] = $messages->send($a, 'user', ['target_therapist_profile_id' => $b->therapistProfile->public_id, 'body' => '予約前に、当日の流れを教えていただけますか？', 'client_message_id' => 'preview-a']);
        $messages->send($b, 'therapist', ['body' => 'はい。はじめにご希望を伺います。気になることはお気軽にご相談ください。', 'client_message_id' => 'preview-b'], $one);
        $messages->send($b, 'user', ['target_therapist_profile_id' => $a->therapistProfile->public_id, 'body' => 'こちらは逆の役割の相談です。別のDMとして表示されます。', 'client_message_id' => 'preview-reverse']);
        $address = ServiceAddress::firstOrCreate(['public_id' => 'addr_dm_preview'], ['account_id' => $a->id, 'place_type' => 'hotel', 'address_line_encrypted' => Crypt::encryptString('架空の確認用住所'), 'lat' => 35.68, 'lng' => 139.76]);
        $booking = Booking::firstOrCreate(['public_id' => 'book_dm_preview'], ['user_account_id' => $a->id, 'therapist_account_id' => $b->id, 'therapist_profile_id' => $b->therapistProfile->id, 'therapist_menu_id' => $b->therapistProfile->menus()->first()->id, 'service_address_id' => $address->id, 'status' => 'accepted', 'duration_minutes' => 60, 'total_amount' => 10300, 'therapist_net_amount' => 9000, 'platform_fee_amount' => 1000, 'matching_fee_amount' => 300, 'scheduled_start_at' => now()->addDay(), 'scheduled_end_at' => now()->addDay()->addHour()]);
        $booking->messages()->firstOrCreate(['sender_account_id' => $a->id], ['message_type' => 'text', 'body_encrypted' => Crypt::encryptString('こちらは予約の連絡です。明日よろしくお願いします。'), 'sent_at' => now(), 'moderation_status' => 'ok']);
    }
}
