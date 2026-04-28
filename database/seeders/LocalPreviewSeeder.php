<?php

namespace Database\Seeders;

use App\Models\Account;
use App\Models\AccountRole;
use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\BookingConsent;
use App\Models\BookingHealthCheck;
use App\Models\BookingMessage;
use App\Models\BookingStatusLog;
use App\Models\IdentityVerification;
use App\Models\PaymentIntent;
use App\Models\PayoutRequest;
use App\Models\ProfilePhoto;
use App\Models\Refund;
use App\Models\Report;
use App\Models\Review;
use App\Models\ServiceAddress;
use App\Models\StripeConnectedAccount;
use App\Models\TherapistAvailabilitySlot;
use App\Models\TherapistLedgerEntry;
use App\Models\TherapistMenu;
use App\Models\TherapistPricingRule;
use App\Models\TherapistProfile;
use App\Models\TherapistTravelRequest;
use App\Models\UserProfile;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Storage;

class LocalPreviewSeeder extends Seeder
{
    public function run(): void
    {
        $now = CarbonImmutable::now()->startOfMinute();

        $previewUser = $this->upsertAccount(
            publicId: 'acc_preview_user',
            email: 'preview-user@sugutachi.local',
            displayName: 'プレビューユーザー',
            roles: ['user'],
            lastActiveRole: 'user',
            phone: '+819000000001',
        );
        $previewTherapist = $this->upsertAccount(
            publicId: 'acc_preview_therap',
            email: 'preview-therapist@sugutachi.local',
            displayName: 'プレビュータチキャスト',
            roles: ['therapist'],
            lastActiveRole: 'therapist',
            phone: '+819000000002',
        );
        $previewHybrid = $this->upsertAccount(
            publicId: 'acc_preview_hybrid',
            email: 'preview-hybrid@sugutachi.local',
            displayName: '兼用プレビュー',
            roles: ['user', 'therapist'],
            lastActiveRole: 'user',
            phone: '+819000000003',
        );
        $reviewerOne = $this->upsertAccount(
            publicId: 'acc_preview_rev1',
            email: 'preview-reviewer1@sugutachi.local',
            displayName: 'レビュー常連A',
            roles: ['user'],
            lastActiveRole: 'user',
            phone: '+819000000004',
        );
        $reviewerTwo = $this->upsertAccount(
            publicId: 'acc_preview_rev2',
            email: 'preview-reviewer2@sugutachi.local',
            displayName: 'レビュー常連B',
            roles: ['user'],
            lastActiveRole: 'user',
            phone: '+819000000005',
        );
        $requester = $this->upsertAccount(
            publicId: 'acc_preview_req',
            email: 'preview-requester@sugutachi.local',
            displayName: '依頼テスター',
            roles: ['user'],
            lastActiveRole: 'user',
            phone: '+819000000006',
        );

        $this->upsertApprovedIdentity($previewUser, birthYear: 1994);
        $this->upsertApprovedIdentity($previewTherapist, birthYear: 1992, birthdate: '1992-07-18');
        $this->upsertApprovedIdentity($previewHybrid, birthYear: 1997, birthdate: '1997-11-04');
        $this->upsertApprovedIdentity($reviewerOne, birthYear: 1989);
        $this->upsertApprovedIdentity($reviewerTwo, birthYear: 1991);
        $this->upsertApprovedIdentity($requester, birthYear: 1999);

        $this->upsertUserProfile($previewUser, [
            'profile_status' => UserProfile::STATUS_ACTIVE,
            'age_range' => '30s',
            'body_type' => 'average',
            'height_cm' => 178,
            'weight_range' => '70_79',
            'preferences_json' => ['relaxation', 'body-care'],
            'touch_ng_json' => ['face', 'hair'],
            'health_notes_encrypted' => Crypt::encryptString('肩と腰の疲れがたまりやすいです。'),
            'sexual_orientation' => 'gay',
            'gender_identity' => 'cis_male',
            'disclose_sensitive_profile_to_therapist' => true,
        ]);
        $this->upsertUserProfile($previewHybrid, [
            'profile_status' => UserProfile::STATUS_ACTIVE,
            'age_range' => '20s',
            'body_type' => 'slim',
            'height_cm' => 172,
            'weight_range' => '60_69',
            'preferences_json' => ['body-care'],
            'touch_ng_json' => ['stomach'],
            'health_notes_encrypted' => Crypt::encryptString('むくみやすいので下半身ケアを重視しています。'),
            'sexual_orientation' => 'bi',
            'gender_identity' => 'trans_male',
            'disclose_sensitive_profile_to_therapist' => true,
        ]);
        $this->upsertUserProfile($reviewerOne, [
            'profile_status' => UserProfile::STATUS_ACTIVE,
            'age_range' => '40s',
            'body_type' => 'muscular',
            'height_cm' => 181,
            'weight_range' => '80_89',
            'preferences_json' => ['deep-pressure'],
            'touch_ng_json' => [],
            'sexual_orientation' => 'gay',
            'gender_identity' => 'cis_male',
            'disclose_sensitive_profile_to_therapist' => false,
        ]);
        $this->upsertUserProfile($reviewerTwo, [
            'profile_status' => UserProfile::STATUS_ACTIVE,
            'age_range' => '30s',
            'body_type' => 'average',
            'height_cm' => 175,
            'weight_range' => '70_79',
            'preferences_json' => ['night-care'],
            'touch_ng_json' => ['neck'],
            'sexual_orientation' => 'gay',
            'gender_identity' => 'cis_male',
            'disclose_sensitive_profile_to_therapist' => false,
        ]);
        $this->upsertUserProfile($requester, [
            'profile_status' => UserProfile::STATUS_ACTIVE,
            'age_range' => '20s',
            'body_type' => 'average',
            'height_cm' => 170,
            'weight_range' => '60_69',
            'preferences_json' => ['quick-care'],
            'touch_ng_json' => [],
            'sexual_orientation' => 'gay',
            'gender_identity' => 'cis_male',
            'disclose_sensitive_profile_to_therapist' => false,
        ]);

        $previewUserAddress = $this->upsertServiceAddress($previewUser, [
            'public_id' => 'addr_preview_home',
            'label' => '自宅',
            'place_type' => 'home',
            'postal_code_encrypted' => Crypt::encryptString('160-0022'),
            'prefecture' => '東京都',
            'city' => '新宿区',
            'address_line_encrypted' => Crypt::encryptString('西新宿 2-8-1'),
            'building_encrypted' => Crypt::encryptString('プレビュータワー 1203'),
            'access_notes_encrypted' => Crypt::encryptString('オートロックなので到着前にメッセージください。'),
            'lat' => '35.6895000',
            'lng' => '139.6917000',
            'is_default' => true,
        ]);
        $this->upsertServiceAddress($previewUser, [
            'public_id' => 'addr_preview_hotel',
            'label' => 'ホテル',
            'place_type' => 'hotel',
            'postal_code_encrypted' => Crypt::encryptString('150-0042'),
            'prefecture' => '東京都',
            'city' => '渋谷区',
            'address_line_encrypted' => Crypt::encryptString('宇田川町 1-12'),
            'building_encrypted' => Crypt::encryptString('渋谷ステイホテル'),
            'access_notes_encrypted' => Crypt::encryptString('フロントへは立ち寄らず客室階で待ち合わせです。'),
            'lat' => '35.6617000',
            'lng' => '139.7041000',
            'is_default' => false,
        ]);
        $hybridUserAddress = $this->upsertServiceAddress($previewHybrid, [
            'public_id' => 'addr_hybrid_home',
            'label' => '滞在先',
            'place_type' => 'other',
            'postal_code_encrypted' => Crypt::encryptString('171-0021'),
            'prefecture' => '東京都',
            'city' => '豊島区',
            'address_line_encrypted' => Crypt::encryptString('西池袋 1-6-1'),
            'building_encrypted' => Crypt::encryptString('サンプル池袋 502'),
            'access_notes_encrypted' => Crypt::encryptString('エレベーターを降りて左手です。'),
            'lat' => '35.7303000',
            'lng' => '139.7100000',
            'is_default' => true,
        ]);
        $this->upsertServiceAddress($previewHybrid, [
            'public_id' => 'addr_hybrid_shinjuku',
            'label' => '新宿の滞在先',
            'place_type' => 'hotel',
            'postal_code_encrypted' => Crypt::encryptString('160-0023'),
            'prefecture' => '東京都',
            'city' => '新宿区',
            'address_line_encrypted' => Crypt::encryptString('西新宿 1-10-2'),
            'building_encrypted' => Crypt::encryptString('サンプル新宿ステイ 704'),
            'access_notes_encrypted' => Crypt::encryptString('フロントではなく客室階で待ち合わせです。'),
            'lat' => '35.6896000',
            'lng' => '139.6919000',
            'is_default' => false,
        ]);
        $reviewerOneAddress = $this->upsertServiceAddress($reviewerOne, [
            'public_id' => 'addr_rev1',
            'label' => '自宅',
            'place_type' => 'home',
            'prefecture' => '東京都',
            'city' => '港区',
            'address_line_encrypted' => Crypt::encryptString('六本木 3-5-1'),
            'lat' => '35.6627000',
            'lng' => '139.7310000',
            'is_default' => true,
        ]);
        $reviewerTwoAddress = $this->upsertServiceAddress($reviewerTwo, [
            'public_id' => 'addr_rev2',
            'label' => 'ホテル',
            'place_type' => 'hotel',
            'prefecture' => '東京都',
            'city' => '中央区',
            'address_line_encrypted' => Crypt::encryptString('銀座 5-2-1'),
            'lat' => '35.6719000',
            'lng' => '139.7636000',
            'is_default' => true,
        ]);
        $requesterAddress = $this->upsertServiceAddress($requester, [
            'public_id' => 'addr_req',
            'label' => 'オフィス',
            'place_type' => 'office',
            'prefecture' => '東京都',
            'city' => '千代田区',
            'address_line_encrypted' => Crypt::encryptString('丸の内 1-1-1'),
            'lat' => '35.6812000',
            'lng' => '139.7671000',
            'is_default' => true,
        ]);

        $previewTherapistProfile = $this->upsertTherapistProfile($previewTherapist, [
            'public_id' => 'thp_preview_thera',
            'public_name' => '奏太',
            'bio' => '都内中心でリラクゼーション / もみほぐしを提供しています。静かなやり取りと、丁寧な圧の調整が得意です。',
            'height_cm' => 178,
            'weight_kg' => 70,
            'p_size_cm' => 15,
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'photo_review_status' => ProfilePhoto::STATUS_APPROVED,
            'is_online' => true,
            'online_since' => $now->subHours(2),
            'last_location_updated_at' => $now->subMinutes(12),
            'approved_at' => $now->subWeeks(3),
            'therapist_cancellation_count' => 1,
        ]);
        $hybridTherapistProfile = $this->upsertTherapistProfile($previewHybrid, [
            'public_id' => 'thp_preview_hybrid',
            'public_name' => '凪',
            'bio' => '池袋周辺を中心に、軽めのボディケアと夜帯の対応をしています。予定予約ベースで動くことが多いです。',
            'height_cm' => 172,
            'weight_kg' => 63,
            'p_size_cm' => 13,
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'photo_review_status' => ProfilePhoto::STATUS_APPROVED,
            'is_online' => true,
            'online_since' => $now->subHour(),
            'last_location_updated_at' => $now->subMinutes(18),
            'approved_at' => $now->subWeeks(2),
            'therapist_cancellation_count' => 0,
        ]);

        $previewTherapistMenu60 = $this->upsertTherapistMenu($previewTherapistProfile, [
            'public_id' => 'menu_prev_thera60',
            'name' => 'ボディケア 60分',
            'description' => '肩・背中を中心に全身をゆるめる標準コースです。',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
            'is_active' => true,
            'sort_order' => 0,
        ]);
        $previewTherapistMenu90 = $this->upsertTherapistMenu($previewTherapistProfile, [
            'public_id' => 'menu_prev_thera90',
            'name' => 'ボディケア 90分',
            'description' => '下半身まで含めてしっかり整えるロングコースです。',
            'duration_minutes' => 90,
            'base_price_amount' => 17000,
            'is_active' => true,
            'sort_order' => 1,
        ]);
        $hybridTherapistMenu = $this->upsertTherapistMenu($hybridTherapistProfile, [
            'public_id' => 'menu_prev_hybrid',
            'name' => 'ナイトケア 75分',
            'description' => '夜帯に向いたゆったりめのボディケアです。',
            'duration_minutes' => 75,
            'base_price_amount' => 15000,
            'is_active' => true,
            'sort_order' => 0,
        ]);

        $this->upsertTherapistLocation($previewTherapistProfile, [
            'lat' => '35.6938000',
            'lng' => '139.7034000',
            'accuracy_m' => 35,
            'source' => 'seed',
            'is_searchable' => true,
        ]);
        $this->upsertTherapistLocation($hybridTherapistProfile, [
            'lat' => '35.7295000',
            'lng' => '139.7109000',
            'accuracy_m' => 42,
            'source' => 'seed',
            'is_searchable' => true,
        ]);

        $this->upsertBookingSetting($previewTherapistProfile, [
            'booking_request_lead_time_minutes' => 60,
            'scheduled_base_label' => '新宿ベース',
            'scheduled_base_lat' => '35.6934000',
            'scheduled_base_lng' => '139.7032000',
            'scheduled_base_accuracy_m' => 40,
        ]);
        $this->upsertBookingSetting($hybridTherapistProfile, [
            'booking_request_lead_time_minutes' => 90,
            'scheduled_base_label' => '池袋ベース',
            'scheduled_base_lat' => '35.7293000',
            'scheduled_base_lng' => '139.7108000',
            'scheduled_base_accuracy_m' => 45,
        ]);

        $slotTonight = $this->upsertAvailabilitySlot($previewTherapistProfile, [
            'public_id' => 'slot_prev_tonight',
            'start_at' => $now->addDay()->setTime(19, 0),
            'end_at' => $now->addDay()->setTime(23, 0),
            'status' => TherapistAvailabilitySlot::STATUS_PUBLISHED,
            'dispatch_base_type' => TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_DEFAULT,
            'dispatch_area_label' => '新宿・代々木',
        ]);
        $this->upsertAvailabilitySlot($previewTherapistProfile, [
            'public_id' => 'slot_prev_tomorrow',
            'start_at' => $now->addDays(2)->setTime(13, 0),
            'end_at' => $now->addDays(2)->setTime(18, 0),
            'status' => TherapistAvailabilitySlot::STATUS_PUBLISHED,
            'dispatch_base_type' => TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_CUSTOM,
            'dispatch_area_label' => '渋谷・恵比寿',
            'custom_dispatch_base_label' => '渋谷サテライト',
            'custom_dispatch_base_lat' => '35.6596000',
            'custom_dispatch_base_lng' => '139.7006000',
            'custom_dispatch_base_accuracy_m' => 35,
        ]);
        $this->upsertAvailabilitySlot($hybridTherapistProfile, [
            'public_id' => 'slot_prev_hybrid',
            'start_at' => $now->addDay()->setTime(18, 0),
            'end_at' => $now->addDay()->setTime(21, 30),
            'status' => TherapistAvailabilitySlot::STATUS_PUBLISHED,
            'dispatch_base_type' => TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_DEFAULT,
            'dispatch_area_label' => '池袋・目白',
        ]);

        $this->upsertPricingRule($previewTherapistProfile, null, [
            'rule_type' => TherapistPricingRule::RULE_TYPE_USER_PROFILE_ATTRIBUTE,
            'condition_json' => [
                'field' => TherapistPricingRule::FIELD_AGE_RANGE,
                'operator' => TherapistPricingRule::OPERATOR_EQUALS,
                'value' => '30s',
            ],
            'adjustment_type' => TherapistPricingRule::ADJUSTMENT_TYPE_FIXED_AMOUNT,
            'adjustment_amount' => 1500,
            'priority' => 10,
            'is_active' => true,
        ]);
        $this->upsertPricingRule($previewTherapistProfile, $previewTherapistMenu90, [
            'rule_type' => TherapistPricingRule::RULE_TYPE_WALKING_TIME_RANGE,
            'condition_json' => [
                'operator' => TherapistPricingRule::OPERATOR_IN,
                'values' => ['within_30_min', 'within_60_min'],
            ],
            'adjustment_type' => TherapistPricingRule::ADJUSTMENT_TYPE_FIXED_AMOUNT,
            'adjustment_amount' => 1200,
            'priority' => 20,
            'is_active' => true,
        ]);
        $this->upsertPricingRule($previewTherapistProfile, null, [
            'rule_type' => TherapistPricingRule::RULE_TYPE_TIME_BAND,
            'condition_json' => [
                'start_hour' => 22,
                'end_hour' => 6,
            ],
            'adjustment_type' => TherapistPricingRule::ADJUSTMENT_TYPE_FIXED_AMOUNT,
            'adjustment_amount' => 1000,
            'priority' => 30,
            'is_active' => true,
        ]);

        $this->upsertStripeConnectedAccount($previewTherapist, $previewTherapistProfile, [
            'stripe_account_id' => 'acct_preview_thera',
            'status' => StripeConnectedAccount::STATUS_ACTIVE,
            'charges_enabled' => true,
            'payouts_enabled' => true,
            'details_submitted' => true,
            'requirements_currently_due_json' => [],
            'requirements_past_due_json' => [],
            'onboarding_completed_at' => $now->subWeeks(3),
            'last_synced_at' => $now->subMinutes(10),
        ]);
        $this->upsertStripeConnectedAccount($previewHybrid, $hybridTherapistProfile, [
            'stripe_account_id' => 'acct_preview_hybrid',
            'status' => StripeConnectedAccount::STATUS_REQUIREMENTS_DUE,
            'charges_enabled' => false,
            'payouts_enabled' => false,
            'details_submitted' => false,
            'requirements_currently_due_json' => ['external_account', 'individual.verification.document'],
            'requirements_past_due_json' => [],
            'onboarding_completed_at' => null,
            'last_synced_at' => $now->subMinutes(20),
        ]);

        $this->upsertProfilePhoto(
            account: $previewUser,
            therapistProfile: null,
            usageType: 'account_profile',
            sortOrder: 0,
            path: 'preview/photos/preview-user.svg',
            svgLabel: 'USER',
            background: '#E4C79A',
            foreground: '#17202B',
            status: ProfilePhoto::STATUS_APPROVED,
        );
        $this->upsertProfilePhoto(
            account: $previewTherapist,
            therapistProfile: $previewTherapistProfile,
            usageType: 'therapist_profile',
            sortOrder: 0,
            path: 'preview/photos/preview-therapist-1.svg',
            svgLabel: 'SOUTA',
            background: '#D7B67B',
            foreground: '#17202B',
            status: ProfilePhoto::STATUS_APPROVED,
        );
        $this->upsertProfilePhoto(
            account: $previewTherapist,
            therapistProfile: $previewTherapistProfile,
            usageType: 'therapist_profile',
            sortOrder: 1,
            path: 'preview/photos/preview-therapist-2.svg',
            svgLabel: 'CARE',
            background: '#F5E8CC',
            foreground: '#17202B',
            status: ProfilePhoto::STATUS_APPROVED,
        );
        $this->upsertProfilePhoto(
            account: $previewHybrid,
            therapistProfile: null,
            usageType: 'account_profile',
            sortOrder: 0,
            path: 'preview/photos/preview-hybrid-user.svg',
            svgLabel: 'HYBRID',
            background: '#C4D4E9',
            foreground: '#17202B',
            status: ProfilePhoto::STATUS_APPROVED,
        );
        $this->upsertProfilePhoto(
            account: $previewHybrid,
            therapistProfile: $hybridTherapistProfile,
            usageType: 'therapist_profile',
            sortOrder: 0,
            path: 'preview/photos/preview-hybrid-therapist.svg',
            svgLabel: 'NAGI',
            background: '#D8E6D0',
            foreground: '#17202B',
            status: ProfilePhoto::STATUS_APPROVED,
        );

        $requestedScheduled = $this->upsertBooking([
            'public_id' => 'book_prev_sched_req',
            'user_account_id' => $previewUser->id,
            'therapist_account_id' => $previewTherapist->id,
            'therapist_profile_id' => $previewTherapistProfile->id,
            'therapist_menu_id' => $previewTherapistMenu90->id,
            'service_address_id' => $previewUserAddress->id,
            'availability_slot_id' => $slotTonight->id,
            'status' => Booking::STATUS_REQUESTED,
            'is_on_demand' => false,
            'requested_start_at' => $now->addDay()->setTime(20, 0),
            'scheduled_start_at' => $now->addDay()->setTime(20, 0),
            'scheduled_end_at' => $now->addDay()->setTime(21, 30),
            'duration_minutes' => 90,
            'buffer_before_minutes' => 15,
            'buffer_after_minutes' => 15,
            'request_expires_at' => $now->addHours(5),
            'total_amount' => 20500,
            'therapist_net_amount' => 17910,
            'platform_fee_amount' => 2290,
            'matching_fee_amount' => 300,
            'user_snapshot_json' => ['display_name' => $previewUser->display_name],
            'therapist_snapshot_json' => ['public_name' => $previewTherapistProfile->public_name],
        ]);
        $requestedNow = $this->upsertBooking([
            'public_id' => 'book_prev_now_req',
            'user_account_id' => $previewHybrid->id,
            'therapist_account_id' => $previewTherapist->id,
            'therapist_profile_id' => $previewTherapistProfile->id,
            'therapist_menu_id' => $previewTherapistMenu60->id,
            'service_address_id' => $hybridUserAddress->id,
            'status' => Booking::STATUS_REQUESTED,
            'is_on_demand' => true,
            'requested_start_at' => $now->addMinutes(35),
            'duration_minutes' => 60,
            'request_expires_at' => $now->addMinutes(20),
            'total_amount' => 13800,
            'therapist_net_amount' => 12150,
            'platform_fee_amount' => 1350,
            'matching_fee_amount' => 300,
        ]);
        $liveBooking = $this->upsertBooking([
            'public_id' => 'book_prev_live',
            'user_account_id' => $previewUser->id,
            'therapist_account_id' => $previewTherapist->id,
            'therapist_profile_id' => $previewTherapistProfile->id,
            'therapist_menu_id' => $previewTherapistMenu60->id,
            'service_address_id' => $previewUserAddress->id,
            'status' => Booking::STATUS_MOVING,
            'is_on_demand' => true,
            'requested_start_at' => $now->subMinutes(25),
            'duration_minutes' => 60,
            'accepted_at' => $now->subMinutes(18),
            'confirmed_at' => $now->subMinutes(18),
            'moving_at' => $now->subMinutes(6),
            'total_amount' => 13800,
            'therapist_net_amount' => 12150,
            'platform_fee_amount' => 1350,
            'matching_fee_amount' => 300,
        ]);
        $completedBooking = $this->upsertBooking([
            'public_id' => 'book_prev_done',
            'user_account_id' => $previewUser->id,
            'therapist_account_id' => $previewTherapist->id,
            'therapist_profile_id' => $previewTherapistProfile->id,
            'therapist_menu_id' => $previewTherapistMenu90->id,
            'service_address_id' => $previewUserAddress->id,
            'status' => Booking::STATUS_COMPLETED,
            'is_on_demand' => true,
            'requested_start_at' => $now->subDays(4)->setTime(21, 0),
            'duration_minutes' => 90,
            'accepted_at' => $now->subDays(4)->setTime(20, 45),
            'confirmed_at' => $now->subDays(4)->setTime(20, 45),
            'moving_at' => $now->subDays(4)->setTime(20, 55),
            'arrived_at' => $now->subDays(4)->setTime(21, 5),
            'started_at' => $now->subDays(4)->setTime(21, 10),
            'ended_at' => $now->subDays(4)->setTime(22, 40),
            'total_amount' => 20500,
            'therapist_net_amount' => 17910,
            'platform_fee_amount' => 2290,
            'matching_fee_amount' => 300,
        ]);
        $canceledBooking = $this->upsertBooking([
            'public_id' => 'book_prev_cancel',
            'user_account_id' => $previewUser->id,
            'therapist_account_id' => $previewTherapist->id,
            'therapist_profile_id' => $previewTherapistProfile->id,
            'therapist_menu_id' => $previewTherapistMenu60->id,
            'service_address_id' => $previewUserAddress->id,
            'status' => Booking::STATUS_CANCELED,
            'is_on_demand' => false,
            'requested_start_at' => $now->subDays(2)->setTime(18, 0),
            'scheduled_start_at' => $now->subDays(2)->setTime(18, 0),
            'scheduled_end_at' => $now->subDays(2)->setTime(19, 0),
            'duration_minutes' => 60,
            'accepted_at' => $now->subDays(2)->setTime(16, 30),
            'confirmed_at' => $now->subDays(2)->setTime(16, 30),
            'canceled_at' => $now->subDays(2)->setTime(17, 0),
            'canceled_by_account_id' => $previewTherapist->id,
            'cancel_reason_code' => 'therapist_unavailable',
            'cancel_reason_note_encrypted' => Crypt::encryptString('急な移動が入ってしまい、この時間帯の対応が難しくなりました。'),
            'total_amount' => 13800,
            'therapist_net_amount' => 12150,
            'platform_fee_amount' => 1350,
            'matching_fee_amount' => 300,
        ]);
        $reviewBookingOne = $this->upsertBooking([
            'public_id' => 'book_prev_review1',
            'user_account_id' => $reviewerOne->id,
            'therapist_account_id' => $previewTherapist->id,
            'therapist_profile_id' => $previewTherapistProfile->id,
            'therapist_menu_id' => $previewTherapistMenu60->id,
            'service_address_id' => $reviewerOneAddress->id,
            'status' => Booking::STATUS_COMPLETED,
            'is_on_demand' => true,
            'requested_start_at' => $now->subDays(7)->setTime(22, 0),
            'duration_minutes' => 60,
            'accepted_at' => $now->subDays(7)->setTime(21, 40),
            'confirmed_at' => $now->subDays(7)->setTime(21, 40),
            'moving_at' => $now->subDays(7)->setTime(21, 50),
            'arrived_at' => $now->subDays(7)->setTime(22, 0),
            'started_at' => $now->subDays(7)->setTime(22, 5),
            'ended_at' => $now->subDays(7)->setTime(23, 5),
            'total_amount' => 13800,
            'therapist_net_amount' => 12150,
            'platform_fee_amount' => 1350,
            'matching_fee_amount' => 300,
        ]);
        $reviewBookingTwo = $this->upsertBooking([
            'public_id' => 'book_prev_review2',
            'user_account_id' => $reviewerTwo->id,
            'therapist_account_id' => $previewTherapist->id,
            'therapist_profile_id' => $previewTherapistProfile->id,
            'therapist_menu_id' => $previewTherapistMenu90->id,
            'service_address_id' => $reviewerTwoAddress->id,
            'status' => Booking::STATUS_COMPLETED,
            'is_on_demand' => true,
            'requested_start_at' => $now->subDays(9)->setTime(20, 30),
            'duration_minutes' => 90,
            'accepted_at' => $now->subDays(9)->setTime(20, 10),
            'confirmed_at' => $now->subDays(9)->setTime(20, 10),
            'moving_at' => $now->subDays(9)->setTime(20, 20),
            'arrived_at' => $now->subDays(9)->setTime(20, 30),
            'started_at' => $now->subDays(9)->setTime(20, 35),
            'ended_at' => $now->subDays(9)->setTime(22, 5),
            'total_amount' => 20500,
            'therapist_net_amount' => 17910,
            'platform_fee_amount' => 2290,
            'matching_fee_amount' => 300,
        ]);

        $paymentIntentScheduled = $this->upsertPaymentIntent($requestedScheduled, $previewUser, [
            'stripe_payment_intent_id' => 'pi_prev_sched_req',
            'stripe_connected_account_id' => $previewTherapist->stripeConnectedAccount?->id,
            'status' => PaymentIntent::STRIPE_STATUS_REQUIRES_CAPTURE,
            'capture_method' => 'manual',
            'currency' => 'jpy',
            'amount' => 20500,
            'application_fee_amount' => 2590,
            'transfer_amount' => 17910,
            'is_current' => true,
            'authorized_at' => $now->subMinutes(10),
        ]);
        $this->upsertPaymentIntent($requestedNow, $previewHybrid, [
            'stripe_payment_intent_id' => 'pi_prev_now_req',
            'stripe_connected_account_id' => $previewTherapist->stripeConnectedAccount?->id,
            'status' => PaymentIntent::STRIPE_STATUS_REQUIRES_CAPTURE,
            'capture_method' => 'manual',
            'currency' => 'jpy',
            'amount' => 13800,
            'application_fee_amount' => 1650,
            'transfer_amount' => 12150,
            'is_current' => true,
            'authorized_at' => $now->subMinutes(8),
        ]);
        $this->upsertPaymentIntent($liveBooking, $previewUser, [
            'stripe_payment_intent_id' => 'pi_prev_live',
            'stripe_connected_account_id' => $previewTherapist->stripeConnectedAccount?->id,
            'status' => PaymentIntent::STRIPE_STATUS_REQUIRES_CAPTURE,
            'capture_method' => 'manual',
            'currency' => 'jpy',
            'amount' => 13800,
            'application_fee_amount' => 1650,
            'transfer_amount' => 12150,
            'is_current' => true,
            'authorized_at' => $now->subMinutes(18),
        ]);
        $paymentIntentCompleted = $this->upsertPaymentIntent($completedBooking, $previewUser, [
            'stripe_payment_intent_id' => 'pi_prev_done',
            'stripe_connected_account_id' => $previewTherapist->stripeConnectedAccount?->id,
            'status' => PaymentIntent::STRIPE_STATUS_SUCCEEDED,
            'capture_method' => 'manual',
            'currency' => 'jpy',
            'amount' => 20500,
            'application_fee_amount' => 2590,
            'transfer_amount' => 17910,
            'is_current' => true,
            'authorized_at' => $now->subDays(4)->setTime(20, 45),
            'captured_at' => $now->subDays(4)->setTime(22, 45),
        ]);
        $paymentIntentCanceled = $this->upsertPaymentIntent($canceledBooking, $previewUser, [
            'stripe_payment_intent_id' => 'pi_prev_cancel',
            'stripe_connected_account_id' => $previewTherapist->stripeConnectedAccount?->id,
            'status' => PaymentIntent::STRIPE_STATUS_CANCELED,
            'capture_method' => 'manual',
            'currency' => 'jpy',
            'amount' => 13800,
            'application_fee_amount' => 1650,
            'transfer_amount' => 12150,
            'is_current' => true,
            'authorized_at' => $now->subDays(2)->setTime(16, 30),
            'canceled_at' => $now->subDays(2)->setTime(17, 0),
        ]);

        $this->upsertBookingStatusLog($requestedScheduled, null, Booking::STATUS_REQUESTED, $previewUser, 'user', null, null, $now->subMinutes(9));
        $this->upsertBookingStatusLog($requestedNow, null, Booking::STATUS_REQUESTED, $previewHybrid, 'user', null, null, $now->subMinutes(7));
        $this->upsertBookingStatusLog($liveBooking, null, Booking::STATUS_ACCEPTED, $previewTherapist, 'therapist', null, null, $now->subMinutes(18));
        $this->upsertBookingStatusLog($liveBooking, Booking::STATUS_ACCEPTED, Booking::STATUS_MOVING, $previewTherapist, 'therapist', null, null, $now->subMinutes(6));
        $this->upsertBookingStatusLog($completedBooking, null, Booking::STATUS_ACCEPTED, $previewTherapist, 'therapist', null, null, $now->subDays(4)->setTime(20, 45));
        $this->upsertBookingStatusLog($completedBooking, Booking::STATUS_ACCEPTED, Booking::STATUS_MOVING, $previewTherapist, 'therapist', null, null, $now->subDays(4)->setTime(20, 55));
        $this->upsertBookingStatusLog($completedBooking, Booking::STATUS_MOVING, Booking::STATUS_ARRIVED, $previewTherapist, 'therapist', null, null, $now->subDays(4)->setTime(21, 5));
        $this->upsertBookingStatusLog($completedBooking, Booking::STATUS_ARRIVED, Booking::STATUS_IN_PROGRESS, $previewTherapist, 'therapist', null, null, $now->subDays(4)->setTime(21, 10));
        $this->upsertBookingStatusLog($completedBooking, Booking::STATUS_IN_PROGRESS, Booking::STATUS_THERAPIST_COMPLETED, $previewTherapist, 'therapist', null, null, $now->subDays(4)->setTime(22, 40));
        $this->upsertBookingStatusLog($completedBooking, Booking::STATUS_THERAPIST_COMPLETED, Booking::STATUS_COMPLETED, $previewUser, 'user', null, null, $now->subDays(4)->setTime(22, 50));
        $this->upsertBookingStatusLog($canceledBooking, null, Booking::STATUS_ACCEPTED, $previewTherapist, 'therapist', null, null, $now->subDays(2)->setTime(16, 30));
        $this->upsertBookingStatusLog($canceledBooking, Booking::STATUS_ACCEPTED, Booking::STATUS_CANCELED, $previewTherapist, 'therapist', 'therapist_unavailable', '急な移動が入り対応できなくなりました。', $now->subDays(2)->setTime(17, 0));

        $this->upsertBookingConsent($liveBooking, $previewUser, 'service_boundaries', $now->subMinutes(16));
        $this->upsertBookingConsent($liveBooking, $previewTherapist, 'service_boundaries', $now->subMinutes(16));
        $this->upsertBookingConsent($completedBooking, $previewUser, 'service_boundaries', $now->subDays(4)->setTime(20, 44));
        $this->upsertBookingConsent($completedBooking, $previewTherapist, 'service_boundaries', $now->subDays(4)->setTime(20, 44));

        $this->upsertBookingHealthCheck($liveBooking, $previewUser, [
            'role' => 'user',
            'drinking_status' => 'none',
            'has_injury' => false,
            'has_fever' => false,
            'contraindications_json' => [],
            'notes_encrypted' => Crypt::encryptString('今日は肩の張りが強めです。'),
            'checked_at' => $now->subMinutes(17),
        ]);
        $this->upsertBookingHealthCheck($liveBooking, $previewTherapist, [
            'role' => 'therapist',
            'drinking_status' => 'none',
            'has_injury' => false,
            'has_fever' => false,
            'contraindications_json' => [],
            'notes_encrypted' => null,
            'checked_at' => $now->subMinutes(17),
        ]);
        $this->upsertBookingHealthCheck($completedBooking, $previewUser, [
            'role' => 'user',
            'drinking_status' => 'light',
            'has_injury' => false,
            'has_fever' => false,
            'contraindications_json' => ['alcohol'],
            'notes_encrypted' => Crypt::encryptString('首まわりは少し弱めでお願いしました。'),
            'checked_at' => $now->subDays(4)->setTime(20, 43),
        ]);
        $this->upsertBookingHealthCheck($completedBooking, $previewTherapist, [
            'role' => 'therapist',
            'drinking_status' => 'none',
            'has_injury' => false,
            'has_fever' => false,
            'contraindications_json' => [],
            'notes_encrypted' => null,
            'checked_at' => $now->subDays(4)->setTime(20, 43),
        ]);

        $this->upsertBookingMessage($requestedScheduled, $previewUser, 'ご都合よければ20時開始でお願いしたいです。', $now->subMinutes(9), null);
        $this->upsertBookingMessage($requestedNow, $previewHybrid, '池袋で今夜お願いできますか？', $now->subMinutes(7), null);
        $this->upsertBookingMessage($liveBooking, $previewTherapist, 'いま向かっています。到着5分前にまた連絡します。', $now->subMinutes(5), null);
        $this->upsertBookingMessage($liveBooking, $previewUser, 'ありがとうございます。エントランスで待っています。', $now->subMinutes(4), $now->subMinutes(3));
        $this->upsertBookingMessage($completedBooking, $previewTherapist, '今日はありがとうございました。水分を取ってゆっくり休んでください。', $now->subDays(4)->setTime(22, 45), $now->subDays(4)->setTime(22, 48));
        $this->upsertBookingMessage($canceledBooking, $previewTherapist, '直前で申し訳ありません。こちらの事情で今回は見送らせてください。', $now->subDays(2)->setTime(17, 0), null);

        $this->upsertReview($completedBooking, $previewUser, $previewTherapist, 'user', [
            'rating_overall' => 5,
            'rating_manners' => 5,
            'rating_skill' => 5,
            'rating_cleanliness' => 4,
            'rating_safety' => 5,
            'public_comment' => 'やり取りが落ち着いていて安心感があり、圧の調整もとても丁寧でした。',
            'private_feedback_encrypted' => Crypt::encryptString('また90分コースでお願いしたいです。'),
            'status' => Review::STATUS_VISIBLE,
            'created_at' => $now->subDays(4)->setTime(23, 0),
            'updated_at' => $now->subDays(4)->setTime(23, 0),
        ]);
        $this->upsertReview($reviewBookingOne, $reviewerOne, $previewTherapist, 'user', [
            'rating_overall' => 5,
            'rating_manners' => 5,
            'rating_skill' => 4,
            'rating_cleanliness' => 5,
            'rating_safety' => 5,
            'public_comment' => '終始スムーズで、終わったあと身体が軽くなりました。',
            'private_feedback_encrypted' => null,
            'status' => Review::STATUS_VISIBLE,
            'created_at' => $now->subDays(7)->setTime(23, 10),
            'updated_at' => $now->subDays(7)->setTime(23, 10),
        ]);
        $this->upsertReview($reviewBookingTwo, $reviewerTwo, $previewTherapist, 'user', [
            'rating_overall' => 4,
            'rating_manners' => 4,
            'rating_skill' => 4,
            'rating_cleanliness' => 4,
            'rating_safety' => 4,
            'public_comment' => '夜帯でも落ち着いていて、やわらかい雰囲気で受けられました。',
            'private_feedback_encrypted' => null,
            'status' => Review::STATUS_VISIBLE,
            'created_at' => $now->subDays(9)->setTime(22, 20),
            'updated_at' => $now->subDays(9)->setTime(22, 20),
        ]);
        $this->upsertReview($completedBooking, $previewTherapist, $previewUser, 'therapist', [
            'rating_overall' => 5,
            'rating_manners' => 5,
            'rating_skill' => null,
            'rating_cleanliness' => null,
            'rating_safety' => 5,
            'public_comment' => 'やり取りが丁寧で、待ち合わせもスムーズでした。',
            'private_feedback_encrypted' => null,
            'status' => Review::STATUS_VISIBLE,
            'created_at' => $now->subDays(4)->setTime(23, 5),
            'updated_at' => $now->subDays(4)->setTime(23, 5),
        ]);
        $this->refreshTherapistRating($previewTherapistProfile);

        $this->upsertRefund($canceledBooking, $paymentIntentCanceled, $previewUser, [
            'public_id' => 'refund_prev_cancel',
            'status' => Refund::STATUS_PROCESSED,
            'reason_code' => Refund::REASON_CODE_BOOKING_CANCELLATION_AUTO,
            'detail_encrypted' => Crypt::encryptString('タチキャスト都合キャンセルのため全額返金'),
            'requested_amount' => 13800,
            'approved_amount' => 13800,
            'stripe_refund_id' => 're_prev_cancel',
            'processed_at' => $now->subDays(2)->setTime(17, 5),
            'reviewed_at' => $now->subDays(2)->setTime(17, 3),
        ]);

        $this->upsertReport($canceledBooking, $previewUser, $previewTherapist, [
            'public_id' => 'rep_prev_cancel',
            'category' => 'cancellation_concern',
            'severity' => Report::SEVERITY_MEDIUM,
            'detail_encrypted' => Crypt::encryptString('直前キャンセルが続くと困るので記録として残します。'),
            'status' => Report::STATUS_OPEN,
            'resolved_at' => null,
        ]);

        $this->upsertTravelRequest($previewUser, $previewTherapist, $previewTherapistProfile, [
            'public_id' => 'tr_prev_osaka',
            'prefecture' => '大阪府',
            'message_encrypted' => Crypt::encryptString('来月大阪に来る予定があれば、梅田あたりで受けたいです。'),
            'status' => TherapistTravelRequest::STATUS_UNREAD,
            'read_at' => null,
            'archived_at' => null,
            'detected_contact_exchange' => false,
        ]);
        $this->upsertTravelRequest($reviewerOne, $previewTherapist, $previewTherapistProfile, [
            'public_id' => 'tr_prev_nagoya',
            'prefecture' => '愛知県',
            'message_encrypted' => Crypt::encryptString('出張があれば名古屋駅周辺でも需要あります。'),
            'status' => TherapistTravelRequest::STATUS_READ,
            'read_at' => $now->subDay(),
            'archived_at' => null,
            'detected_contact_exchange' => false,
        ]);
        $this->upsertTravelRequest($previewHybrid, $previewTherapist, $previewTherapistProfile, [
            'public_id' => 'tr_prev_sendai',
            'prefecture' => '宮城県',
            'message_encrypted' => Crypt::encryptString('仙台方面に来るときがあれば知らせてほしいです。'),
            'status' => TherapistTravelRequest::STATUS_ARCHIVED,
            'read_at' => $now->subDays(3),
            'archived_at' => $now->subDays(2),
            'detected_contact_exchange' => false,
        ]);

        $paidPayout = $this->upsertPayoutRequest($previewTherapist, $previewTherapist->stripeConnectedAccount, [
            'public_id' => 'payout_prev_paid',
            'status' => PayoutRequest::STATUS_PAID,
            'requested_amount' => 11000,
            'fee_amount' => 330,
            'net_amount' => 10670,
            'requested_at' => $now->subDays(12),
            'scheduled_process_date' => $now->subDays(9)->toDateString(),
            'processed_at' => $now->subDays(9),
            'stripe_payout_id' => 'po_prev_paid',
            'failure_reason' => null,
        ]);

        $this->upsertLedgerEntry($previewTherapist, $completedBooking, null, [
            'entry_type' => TherapistLedgerEntry::TYPE_BOOKING_SALE,
            'amount_signed' => 17910,
            'status' => TherapistLedgerEntry::STATUS_AVAILABLE,
            'available_at' => $now->subDays(1),
            'description' => '完了済み予約の売上',
            'metadata_json' => ['booking_public_id' => $completedBooking->public_id],
        ]);
        $this->upsertLedgerEntry($previewTherapist, $reviewBookingOne, null, [
            'entry_type' => TherapistLedgerEntry::TYPE_BOOKING_SALE,
            'amount_signed' => 12150,
            'status' => TherapistLedgerEntry::STATUS_PENDING,
            'available_at' => $now->addDay(),
            'description' => '解放待ちの売上',
            'metadata_json' => ['booking_public_id' => $reviewBookingOne->public_id],
        ]);
        $this->upsertLedgerEntry($previewTherapist, $reviewBookingTwo, $paidPayout, [
            'entry_type' => TherapistLedgerEntry::TYPE_BOOKING_SALE,
            'amount_signed' => 11000,
            'status' => TherapistLedgerEntry::STATUS_PAID,
            'available_at' => $now->subDays(10),
            'description' => '支払済みの売上',
            'metadata_json' => ['booking_public_id' => $reviewBookingTwo->public_id],
        ]);

        $this->upsertNotification($previewTherapist, [
            'notification_type' => 'booking_requested',
            'channel' => 'in_app',
            'title' => '新しい予約依頼が届きました',
            'body' => '今すぐ予約と予定予約の依頼を確認してください。',
            'data_json' => ['booking_public_id' => $requestedScheduled->public_id],
            'status' => AppNotification::STATUS_SENT,
            'sent_at' => $now->subMinutes(9),
            'read_at' => null,
        ]);
        $this->upsertNotification($previewUser, [
            'notification_type' => 'booking_accepted',
            'channel' => 'in_app',
            'title' => '予約が確定しました',
            'body' => '担当タチキャストが向かっています。',
            'data_json' => ['booking_public_id' => $liveBooking->public_id],
            'status' => AppNotification::STATUS_SENT,
            'sent_at' => $now->subMinutes(18),
            'read_at' => null,
        ]);
        $this->upsertNotification($previewUser, [
            'notification_type' => 'booking_canceled',
            'channel' => 'in_app',
            'title' => '予約がキャンセルされました',
            'body' => 'タチキャスト都合で予約がキャンセルされました。返金状況を確認してください。',
            'data_json' => ['booking_public_id' => $canceledBooking->public_id],
            'status' => AppNotification::STATUS_SENT,
            'sent_at' => $now->subDays(2)->setTime(17, 0),
            'read_at' => null,
        ]);
        $this->upsertNotification($previewUser, [
            'notification_type' => 'booking_refunded',
            'channel' => 'in_app',
            'title' => '返金が処理されました',
            'body' => 'キャンセル分の返金処理が完了しています。',
            'data_json' => ['booking_public_id' => $canceledBooking->public_id, 'refund_public_id' => 'refund_prev_cancel'],
            'status' => AppNotification::STATUS_SENT,
            'sent_at' => $now->subDays(2)->setTime(17, 5),
            'read_at' => null,
        ]);

        $this->command?->info('Local preview accounts are ready:');
        $this->command?->table(
            ['Role', 'Email', 'Password', 'Notes'],
            [
                ['利用者', 'preview-user@sugutachi.local', 'password', '検索、予約、レビュー履歴の確認用'],
                ['タチキャスト', 'preview-therapist@sugutachi.local', 'password', '依頼、予約、売上、レビュー受信の確認用'],
                ['兼用', 'preview-hybrid@sugutachi.local', 'password', 'ロール切替と第2の公開タチキャスト確認用'],
            ],
        );
    }

    private function upsertAccount(
        string $publicId,
        string $email,
        string $displayName,
        array $roles,
        string $lastActiveRole,
        ?string $phone = null,
    ): Account {
        $account = Account::query()->firstOrNew(['public_id' => $publicId]);
        $account->forceFill([
            'email' => $email,
            'email_verified_at' => now(),
            'phone_e164' => $phone,
            'phone_verified_at' => now(),
            'password' => 'password',
            'display_name' => $displayName,
            'status' => Account::STATUS_ACTIVE,
            'last_active_role' => $lastActiveRole,
        ])->save();

        foreach ($roles as $role) {
            $assignment = AccountRole::query()->firstOrNew([
                'account_id' => $account->id,
                'role' => $role,
            ]);
            $assignment->forceFill([
                'status' => 'active',
                'granted_at' => now()->subWeek(),
                'revoked_at' => null,
            ])->save();
        }

        return $account->fresh();
    }

    private function upsertApprovedIdentity(Account $account, int $birthYear, ?string $birthdate = null): void
    {
        $verification = $account->identityVerifications()->firstOrNew([
            'provider' => 'manual',
            'status' => IdentityVerification::STATUS_APPROVED,
        ]);

        $verification->forceFill([
            'birthdate_encrypted' => $birthdate ? Crypt::encryptString($birthdate) : null,
            'birth_year' => $birthYear,
            'is_age_verified' => true,
            'self_declared_male' => true,
            'document_type' => 'drivers_license',
            'submitted_at' => now()->subWeeks(4),
            'reviewed_at' => now()->subWeeks(4)->addMinutes(30),
            'purge_after' => now()->addYear(),
        ])->save();
    }

    private function upsertUserProfile(Account $account, array $attributes): void
    {
        $profile = $account->userProfile()->firstOrNew();
        $profile->forceFill($attributes)->save();
    }

    private function upsertServiceAddress(Account $account, array $attributes): ServiceAddress
    {
        $address = ServiceAddress::query()->firstOrNew([
            'public_id' => $attributes['public_id'],
        ]);

        $address->forceFill(array_merge($attributes, [
            'account_id' => $account->id,
        ]))->save();

        return $address->fresh();
    }

    private function upsertTherapistProfile(Account $account, array $attributes): TherapistProfile
    {
        $profile = $account->therapistProfile()->firstOrNew();
        $profile->forceFill($attributes)->save();

        return $profile->fresh();
    }

    private function upsertTherapistMenu(TherapistProfile $profile, array $attributes): TherapistMenu
    {
        $menu = TherapistMenu::query()->firstOrNew([
            'public_id' => $attributes['public_id'],
        ]);
        $menu->forceFill(array_merge($attributes, [
            'therapist_profile_id' => $profile->id,
        ]))->save();

        return $menu->fresh();
    }

    private function upsertTherapistLocation(TherapistProfile $profile, array $attributes): void
    {
        $location = $profile->location()->firstOrNew();
        $location->forceFill($attributes)->save();
    }

    private function upsertBookingSetting(TherapistProfile $profile, array $attributes): void
    {
        $setting = $profile->bookingSetting()->firstOrNew();
        $setting->forceFill($attributes)->save();
    }

    private function upsertAvailabilitySlot(TherapistProfile $profile, array $attributes): TherapistAvailabilitySlot
    {
        $slot = TherapistAvailabilitySlot::query()->firstOrNew([
            'public_id' => $attributes['public_id'],
        ]);
        $slot->forceFill(array_merge($attributes, [
            'therapist_profile_id' => $profile->id,
        ]))->save();

        return $slot->fresh();
    }

    private function upsertPricingRule(TherapistProfile $profile, ?TherapistMenu $menu, array $attributes): void
    {
        $rule = TherapistPricingRule::query()->firstOrNew([
            'therapist_profile_id' => $profile->id,
            'therapist_menu_id' => $menu?->id,
            'rule_type' => $attributes['rule_type'],
            'priority' => $attributes['priority'],
        ]);

        $rule->forceFill(array_merge($attributes, [
            'therapist_profile_id' => $profile->id,
            'therapist_menu_id' => $menu?->id,
        ]))->save();
    }

    private function upsertStripeConnectedAccount(Account $account, TherapistProfile $profile, array $attributes): void
    {
        $connectedAccount = $account->stripeConnectedAccount()->firstOrNew();
        $connectedAccount->forceFill(array_merge($attributes, [
            'account_id' => $account->id,
            'therapist_profile_id' => $profile->id,
            'account_type' => 'express',
        ]))->save();
    }

    private function upsertProfilePhoto(
        Account $account,
        ?TherapistProfile $therapistProfile,
        string $usageType,
        int $sortOrder,
        string $path,
        string $svgLabel,
        string $background,
        string $foreground,
        string $status,
    ): void {
        $svg = $this->svgAvatar($svgLabel, $background, $foreground);
        Storage::disk('local')->put($path, $svg);

        $photo = ProfilePhoto::query()->firstOrNew([
            'account_id' => $account->id,
            'usage_type' => $usageType,
            'sort_order' => $sortOrder,
        ]);
        $photo->forceFill([
            'therapist_profile_id' => $therapistProfile?->id,
            'storage_key_encrypted' => Crypt::encryptString($path),
            'content_hash' => hash('sha256', $svg),
            'status' => $status,
            'rejection_reason_code' => null,
            'reviewed_at' => now()->subWeek(),
        ])->save();
    }

    private function upsertBooking(array $attributes): Booking
    {
        $booking = Booking::query()->firstOrNew([
            'public_id' => $attributes['public_id'],
        ]);
        $booking->forceFill($attributes)->save();

        return $booking->fresh();
    }

    private function upsertPaymentIntent(Booking $booking, Account $payer, array $attributes): PaymentIntent
    {
        $paymentIntent = PaymentIntent::query()->firstOrNew([
            'stripe_payment_intent_id' => $attributes['stripe_payment_intent_id'],
        ]);
        $paymentIntent->forceFill(array_merge($attributes, [
            'booking_id' => $booking->id,
            'payer_account_id' => $payer->id,
        ]))->save();

        return $paymentIntent->fresh();
    }

    private function upsertBookingStatusLog(
        Booking $booking,
        ?string $fromStatus,
        string $toStatus,
        ?Account $actor,
        ?string $actorRole,
        ?string $reasonCode,
        ?string $note,
        CarbonImmutable $createdAt,
    ): void {
        $log = BookingStatusLog::query()->firstOrNew([
            'booking_id' => $booking->id,
            'to_status' => $toStatus,
            'created_at' => $createdAt,
        ]);

        $log->forceFill([
            'from_status' => $fromStatus,
            'actor_account_id' => $actor?->id,
            'actor_role' => $actorRole,
            'reason_code' => $reasonCode,
            'note_encrypted' => $note ? Crypt::encryptString($note) : null,
            'metadata_json' => null,
        ])->save();
    }

    private function upsertBookingConsent(Booking $booking, Account $account, string $consentType, CarbonImmutable $consentedAt): void
    {
        $consent = BookingConsent::query()->firstOrNew([
            'booking_id' => $booking->id,
            'account_id' => $account->id,
            'consent_type' => $consentType,
        ]);

        $consent->forceFill([
            'legal_document_id' => null,
            'consented_at' => $consentedAt,
            'ip_hash' => hash('sha256', $account->public_id.'-'.$booking->public_id),
        ])->save();
    }

    private function upsertBookingHealthCheck(Booking $booking, Account $account, array $attributes): void
    {
        $check = BookingHealthCheck::query()->firstOrNew([
            'booking_id' => $booking->id,
            'account_id' => $account->id,
            'role' => $attributes['role'],
        ]);

        $check->forceFill($attributes)->save();
    }

    private function upsertBookingMessage(
        Booking $booking,
        Account $sender,
        string $body,
        CarbonImmutable $sentAt,
        ?CarbonImmutable $readAt,
    ): void {
        $message = BookingMessage::query()->firstOrNew([
            'booking_id' => $booking->id,
            'sender_account_id' => $sender->id,
            'sent_at' => $sentAt,
        ]);

        $message->forceFill([
            'message_type' => 'text',
            'body_encrypted' => Crypt::encryptString($body),
            'detected_contact_exchange' => false,
            'moderation_status' => BookingMessage::MODERATION_STATUS_OK,
            'read_at' => $readAt,
            'moderated_by_admin_account_id' => null,
            'moderated_at' => null,
        ])->save();
    }

    private function upsertReview(Booking $booking, Account $reviewer, Account $reviewee, string $reviewerRole, array $attributes): void
    {
        $review = Review::query()->firstOrNew([
            'booking_id' => $booking->id,
            'reviewer_account_id' => $reviewer->id,
        ]);

        $review->forceFill(array_merge($attributes, [
            'reviewee_account_id' => $reviewee->id,
            'reviewer_role' => $reviewerRole,
        ]))->save();
    }

    private function refreshTherapistRating(TherapistProfile $profile): void
    {
        $summary = Review::query()
            ->where('reviewee_account_id', $profile->account_id)
            ->where('reviewer_role', 'user')
            ->where('status', Review::STATUS_VISIBLE)
            ->selectRaw('count(*) as review_count, avg(rating_overall) as rating_average')
            ->first();

        $profile->forceFill([
            'review_count' => (int) ($summary?->review_count ?? 0),
            'rating_average' => round((float) ($summary?->rating_average ?? 0), 2),
        ])->save();
    }

    private function upsertRefund(Booking $booking, ?PaymentIntent $paymentIntent, Account $requestedBy, array $attributes): void
    {
        $refund = Refund::query()->firstOrNew([
            'public_id' => $attributes['public_id'],
        ]);
        $refund->forceFill(array_merge($attributes, [
            'booking_id' => $booking->id,
            'payment_intent_id' => $paymentIntent?->id,
            'requested_by_account_id' => $requestedBy->id,
        ]))->save();
    }

    private function upsertReport(Booking $booking, Account $reporter, Account $target, array $attributes): void
    {
        $report = Report::query()->firstOrNew([
            'public_id' => $attributes['public_id'],
        ]);
        $report->forceFill(array_merge($attributes, [
            'booking_id' => $booking->id,
            'reporter_account_id' => $reporter->id,
            'target_account_id' => $target->id,
        ]))->save();
    }

    private function upsertTravelRequest(Account $user, Account $therapist, TherapistProfile $profile, array $attributes): void
    {
        $travelRequest = TherapistTravelRequest::query()->firstOrNew([
            'public_id' => $attributes['public_id'],
        ]);

        $travelRequest->forceFill(array_merge($attributes, [
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $profile->id,
        ]))->save();
    }

    private function upsertPayoutRequest(Account $therapist, ?StripeConnectedAccount $connectedAccount, array $attributes): PayoutRequest
    {
        $payoutRequest = PayoutRequest::query()->firstOrNew([
            'public_id' => $attributes['public_id'],
        ]);
        $payoutRequest->forceFill(array_merge($attributes, [
            'therapist_account_id' => $therapist->id,
            'stripe_connected_account_id' => $connectedAccount?->id,
        ]))->save();

        return $payoutRequest->fresh();
    }

    private function upsertLedgerEntry(Account $therapist, ?Booking $booking, ?PayoutRequest $payoutRequest, array $attributes): void
    {
        $entry = TherapistLedgerEntry::query()->firstOrNew([
            'therapist_account_id' => $therapist->id,
            'description' => $attributes['description'],
        ]);
        $entry->forceFill(array_merge($attributes, [
            'booking_id' => $booking?->id,
            'payout_request_id' => $payoutRequest?->id,
        ]))->save();
    }

    private function upsertNotification(Account $account, array $attributes): void
    {
        $notification = AppNotification::query()->firstOrNew([
            'account_id' => $account->id,
            'notification_type' => $attributes['notification_type'],
            'title' => $attributes['title'],
        ]);
        $notification->forceFill($attributes)->save();
    }

    private function svgAvatar(string $label, string $background, string $foreground): string
    {
        $safeLabel = e($label);

        return <<<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640" fill="none">
  <rect width="640" height="640" rx="40" fill="{$background}"/>
  <circle cx="320" cy="240" r="120" fill="{$foreground}" fill-opacity="0.12"/>
  <rect x="120" y="390" width="400" height="90" rx="45" fill="{$foreground}" fill-opacity="0.12"/>
  <text x="320" y="340" text-anchor="middle" font-size="88" font-family="Arial, sans-serif" font-weight="700" fill="{$foreground}">{$safeLabel}</text>
</svg>
SVG;
    }
}
