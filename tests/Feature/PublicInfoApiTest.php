<?php

namespace Tests\Feature;

use App\Models\Account;
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
            ->assertJsonPath('data.booking.payment_methods.0', 'card');
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
