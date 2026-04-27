<?php

namespace Tests\Feature;

use App\Models\Account;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class LocationSearchApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_search_locations(): void
    {
        $account = Account::factory()->create(['public_id' => 'acc_location_search_user']);
        $token = $account->createToken('api')->plainTextToken;

        Http::fake([
            'https://nominatim.openstreetmap.org/search*' => Http::response([
                [
                    'display_name' => '新宿駅, 新宿区, 東京都, 日本',
                    'lat' => '35.689592',
                    'lon' => '139.700413',
                ],
                [
                    'display_name' => '新宿三丁目駅, 新宿区, 東京都, 日本',
                    'lat' => '35.690412',
                    'lon' => '139.704512',
                ],
            ], 200),
        ]);

        $this->withToken($token)
            ->getJson('/api/me/location-search?q=新宿駅')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.display_name', '新宿駅, 新宿区, 東京都, 日本')
            ->assertJsonPath('data.0.lat', 35.689592)
            ->assertJsonPath('data.0.lng', 139.700413);
    }

    public function test_location_search_returns_gateway_error_when_provider_fails(): void
    {
        $account = Account::factory()->create(['public_id' => 'acc_location_search_error']);
        $token = $account->createToken('api')->plainTextToken;

        Http::fake([
            'https://nominatim.openstreetmap.org/search*' => Http::response([], 500),
        ]);

        $this->withToken($token)
            ->getJson('/api/me/location-search?q=新宿駅')
            ->assertStatus(502)
            ->assertJsonPath('message', '住所検索に失敗しました。しばらくしてからもう一度お試しください。');
    }
}
