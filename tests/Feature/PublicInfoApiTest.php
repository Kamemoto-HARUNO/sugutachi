<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\IdentityVerification;
use App\Models\LegalDocument;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicInfoApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_can_get_service_meta(): void
    {
        config()->set('service_meta.name', 'すぐタチ');
        config()->set('service_meta.domain', 'sugutachi.com');
        config()->set('service_meta.base_url', 'https://sugutachi.com');
        config()->set('service_meta.support_email', 'support@sugutachi.com');
        config()->set('service_meta.fees.currency', 'jpy');
        config()->set('service_meta.fees.matching_fee_amount', 300);
        config()->set('service_meta.fees.platform_fee_rate', 0.1);
        config()->set('service_meta.commerce.operator_name', '合同会社すぐタチ');
        config()->set('service_meta.commerce.representative_name', '亀本 春乃');
        config()->set('service_meta.commerce.business_address', '東京都渋谷区...');
        config()->set('service_meta.commerce.phone_number', '03-0000-0000');
        config()->set('service_meta.commerce.inquiry_hours', '平日 10:00-18:00');
        config()->set('service_meta.commerce.payment_timing', '予約時にクレジットカード決済');
        config()->set('service_meta.commerce.service_delivery_timing', '予約成立後、予約日時に役務提供');
        config()->set('service_meta.commerce.cancellation_policy_summary', 'キャンセルポリシーに従います。');
        config()->set('service_meta.commerce.refund_policy_summary', '返金ポリシーに従います。');
        LegalDocument::create([
            'public_id' => 'ldoc_terms_meta',
            'document_type' => 'terms',
            'version' => '2026-05-01',
            'title' => '利用規約',
            'body' => '利用規約本文',
            'published_at' => now()->subDay(),
            'effective_at' => now(),
        ]);
        LegalDocument::create([
            'public_id' => 'ldoc_privacy_meta',
            'document_type' => 'privacy',
            'version' => '2026-05-01',
            'title' => 'プライバシーポリシー',
            'body' => 'プライバシーポリシー本文',
            'published_at' => now()->subDay(),
            'effective_at' => now(),
        ]);
        LegalDocument::create([
            'public_id' => 'ldoc_commerce_meta',
            'document_type' => 'commerce',
            'version' => '2026-05-01',
            'title' => '特定商取引法に基づく表記',
            'body' => '特商法本文',
            'published_at' => now()->subDay(),
            'effective_at' => now(),
        ]);

        $this->getJson('/api/service-meta')
            ->assertOk()
            ->assertJsonPath('data.service_name', 'すぐタチ')
            ->assertJsonPath('data.domain', 'sugutachi.com')
            ->assertJsonPath('data.base_url', 'https://sugutachi.com')
            ->assertJsonPath('data.support_email', 'support@sugutachi.com')
            ->assertJsonPath('data.fees.currency', 'jpy')
            ->assertJsonPath('data.fees.matching_fee_amount', 300)
            ->assertJsonPath('data.fees.platform_fee_rate', 0.1)
            ->assertJsonPath('data.booking.minimum_age', 18)
            ->assertJsonPath('data.booking.payment_methods.0', 'card')
            ->assertJsonPath('data.commerce_notice.operator_name', '合同会社すぐタチ')
            ->assertJsonPath('data.commerce_notice.representative_name', '亀本 春乃')
            ->assertJsonPath('data.commerce_notice.business_address', '東京都渋谷区...')
            ->assertJsonPath('data.commerce_notice.phone_number', '03-0000-0000')
            ->assertJsonPath('data.commerce_notice.contact_email', 'support@sugutachi.com')
            ->assertJsonPath('data.commerce_notice.inquiry_hours', '平日 10:00-18:00')
            ->assertJsonPath('data.commerce_notice.payment_timing', '予約時にクレジットカード決済')
            ->assertJsonPath('data.commerce_notice.service_delivery_timing', '予約成立後、予約日時に役務提供')
            ->assertJsonPath('data.commerce_notice.cancellation_policy_summary', 'キャンセルポリシーに従います。')
            ->assertJsonPath('data.commerce_notice.refund_policy_summary', '返金ポリシーに従います。')
            ->assertJsonPath('data.commerce_notice.supported_payment_methods.0', 'card')
            ->assertJsonPath('data.commerce_notice.legal_document_type', 'commerce')
            ->assertJsonPath('data.commerce_notice.legal_document.public_id', 'ldoc_commerce_meta')
            ->assertJsonPath('data.commerce_notice.legal_document.path', '/api/legal-documents/commerce')
            ->assertJsonPath('data.legal_documents.0.document_type', 'terms')
            ->assertJsonPath('data.legal_documents.0.path', '/api/legal-documents/terms')
            ->assertJsonPath('data.legal_documents.1.document_type', 'privacy')
            ->assertJsonPath('data.legal_documents.2.document_type', 'commerce');
    }

    public function test_guest_can_get_help_faqs(): void
    {
        config()->set('help.faqs', [
            [
                'id' => 'payment',
                'category' => 'payment',
                'question' => '支払い方法は？',
                'answer' => 'カードのみです。',
                'sort_order' => 20,
            ],
            [
                'id' => 'about',
                'category' => 'service',
                'question' => 'どんなサービス？',
                'answer' => 'リラクゼーション向けです。',
                'sort_order' => 10,
            ],
        ]);

        $this->getJson('/api/help/faqs')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.id', 'about')
            ->assertJsonPath('data.1.id', 'payment');
    }

    public function test_guest_can_get_public_therapist_previews(): void
    {
        $visibleOnline = Account::factory()->create(['public_id' => 'acc_public_online']);
        $visibleOffline = Account::factory()->create(['public_id' => 'acc_public_offline']);
        $hidden = Account::factory()->create(['public_id' => 'acc_public_hidden']);

        $onlineProfile = TherapistProfile::create([
            'account_id' => $visibleOnline->id,
            'public_id' => 'thp_public_online',
            'public_name' => 'Public Online',
            'bio' => '落ち着いたボディケアを提供します。',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'is_online' => true,
            'rating_average' => 4.9,
            'review_count' => 22,
            'therapist_cancellation_count' => 1,
        ]);
        TherapistMenu::create([
            'public_id' => 'menu_public_online',
            'therapist_profile_id' => $onlineProfile->id,
            'name' => 'Body Care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
            'is_active' => true,
        ]);
        IdentityVerification::create([
            'account_id' => $visibleOnline->id,
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);

        $offlineProfile = TherapistProfile::create([
            'account_id' => $visibleOffline->id,
            'public_id' => 'thp_public_offline',
            'public_name' => 'Public Offline',
            'bio' => '予定予約中心で公開しています。',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'is_online' => false,
            'rating_average' => 4.7,
            'review_count' => 14,
            'therapist_cancellation_count' => 0,
        ]);
        TherapistMenu::create([
            'public_id' => 'menu_public_offline',
            'therapist_profile_id' => $offlineProfile->id,
            'name' => 'Body Care 90',
            'duration_minutes' => 90,
            'base_price_amount' => 15000,
            'is_active' => true,
        ]);
        IdentityVerification::create([
            'account_id' => $visibleOffline->id,
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);

        $hiddenProfile = TherapistProfile::create([
            'account_id' => $hidden->id,
            'public_id' => 'thp_public_hidden',
            'public_name' => 'Hidden Profile',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'is_online' => true,
        ]);
        TherapistMenu::create([
            'public_id' => 'menu_public_hidden',
            'therapist_profile_id' => $hiddenProfile->id,
            'name' => 'Body Care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
            'is_active' => true,
        ]);
        IdentityVerification::create([
            'account_id' => $hidden->id,
            'status' => IdentityVerification::STATUS_REJECTED,
            'is_age_verified' => false,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);

        $this->getJson('/api/public-therapists?limit=4')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.public_id', 'thp_public_online')
            ->assertJsonPath('data.0.age', null)
            ->assertJsonPath('data.0.height_cm', null)
            ->assertJsonPath('data.0.weight_kg', null)
            ->assertJsonPath('data.0.p_size_cm', null)
            ->assertJsonPath('data.0.walking_time_range', null)
            ->assertJsonPath('data.0.estimated_total_amount', null)
            ->assertJsonPath('data.1.public_id', 'thp_public_offline');
    }

    public function test_guest_can_submit_contact_inquiry(): void
    {
        $this->postJson('/api/contact', [
            'name' => 'ゲスト利用者',
            'email' => 'guest@example.com',
            'category' => 'service',
            'message' => 'サービス内容について確認したいです。',
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.category', 'service')
            ->assertJsonPath('data.source', 'guest');

        $this->assertDatabaseHas('contact_inquiries', [
            'email' => 'guest@example.com',
            'category' => 'service',
            'source' => 'guest',
        ]);
    }

    public function test_authenticated_user_can_submit_contact_without_explicit_email(): void
    {
        $account = Account::factory()->create([
            'public_id' => 'acc_contact_user',
            'email' => 'member@example.com',
        ]);
        $token = $account->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/contact', [
                'name' => '会員ユーザー',
                'category' => 'booking',
                'message' => '予約について確認したいです。',
            ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.category', 'booking')
            ->assertJsonPath('data.source', 'authenticated');

        $this->assertDatabaseHas('contact_inquiries', [
            'account_id' => $account->id,
            'email' => 'member@example.com',
            'category' => 'booking',
            'source' => 'authenticated',
        ]);
    }
}
