<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\ServiceAddress;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Tests\TestCase;

class ServiceAddressApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_manage_service_addresses_with_updates_and_default_selection(): void
    {
        $user = Account::factory()->create(['public_id' => 'acc_service_address_user']);
        $token = $user->createToken('api')->plainTextToken;

        $primaryAddressId = $this->withToken($token)
            ->postJson('/api/me/service-addresses', [
                'label' => 'Home base',
                'place_type' => 'home',
                'postal_code' => '150-0001',
                'prefecture' => 'Tokyo',
                'city' => 'Shibuya',
                'address_line' => '1-2-3 Jingumae',
                'building' => 'Room 201',
                'access_notes' => 'Use the side entrance.',
                'lat' => 35.6697,
                'lng' => 139.7039,
            ])
            ->assertCreated()
            ->assertJsonPath('data.is_default', true)
            ->assertJsonPath('data.address_line', '1-2-3 Jingumae')
            ->json('data.public_id');

        $secondaryAddressId = $this->withToken($token)
            ->postJson('/api/me/service-addresses', [
                'label' => 'Hotel stay',
                'place_type' => 'hotel',
                'postal_code' => '160-0022',
                'prefecture' => 'Tokyo',
                'city' => 'Shinjuku',
                'address_line' => '4-5-6 Kabukicho',
                'building' => 'Tower 10F',
                'access_notes' => 'Ask at front desk.',
                'lat' => 35.6938,
                'lng' => 139.7034,
            ])
            ->assertCreated()
            ->assertJsonPath('data.is_default', false)
            ->json('data.public_id');

        $this->withToken($token)
            ->getJson("/api/me/service-addresses/{$secondaryAddressId}")
            ->assertOk()
            ->assertJsonPath('data.postal_code', '160-0022')
            ->assertJsonPath('data.address_line', '4-5-6 Kabukicho')
            ->assertJsonPath('data.building', 'Tower 10F')
            ->assertJsonPath('data.access_notes', 'Ask at front desk.');

        $this->withToken($token)
            ->patchJson("/api/me/service-addresses/{$secondaryAddressId}", [
                'label' => 'Hotel stay updated',
                'city' => 'Minato',
                'address_line' => '7-8-9 Roppongi',
                'building' => null,
                'access_notes' => 'Meet in lobby.',
                'lat' => 35.6628,
                'lng' => 139.7310,
            ])
            ->assertOk()
            ->assertJsonPath('data.label', 'Hotel stay updated')
            ->assertJsonPath('data.city', 'Minato')
            ->assertJsonPath('data.address_line', '7-8-9 Roppongi')
            ->assertJsonPath('data.building', null)
            ->assertJsonPath('data.access_notes', 'Meet in lobby.');

        $this->withToken($token)
            ->postJson("/api/me/service-addresses/{$secondaryAddressId}/default")
            ->assertOk()
            ->assertJsonPath('data.public_id', $secondaryAddressId)
            ->assertJsonPath('data.is_default', true);

        $this->assertDatabaseHas('service_addresses', [
            'public_id' => $primaryAddressId,
            'is_default' => false,
        ]);
        $this->assertDatabaseHas('service_addresses', [
            'public_id' => $secondaryAddressId,
            'is_default' => true,
        ]);

        $this->withToken($token)
            ->getJson('/api/me/service-addresses')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.public_id', $secondaryAddressId)
            ->assertJsonPath('data.0.is_default', true)
            ->assertJsonPath('data.0.address_line', '7-8-9 Roppongi');
    }

    public function test_non_owner_cannot_update_or_set_default_service_address(): void
    {
        $owner = Account::factory()->create(['public_id' => 'acc_service_address_owner']);
        $other = Account::factory()->create(['public_id' => 'acc_service_address_other']);

        $address = ServiceAddress::create([
            'public_id' => 'addr_service_address_private',
            'account_id' => $owner->id,
            'label' => 'Private place',
            'place_type' => 'home',
            'postal_code_encrypted' => Crypt::encryptString('111-1111'),
            'prefecture' => 'Tokyo',
            'city' => 'Taito',
            'address_line_encrypted' => Crypt::encryptString('1-1-1 Asakusa'),
            'building_encrypted' => Crypt::encryptString('House'),
            'access_notes_encrypted' => Crypt::encryptString('Ring twice'),
            'lat' => '35.7148',
            'lng' => '139.7967',
            'is_default' => true,
        ]);

        $this->withToken($other->createToken('api')->plainTextToken)
            ->patchJson("/api/me/service-addresses/{$address->public_id}", [
                'city' => 'Chiyoda',
            ])
            ->assertNotFound();

        $this->withToken($other->createToken('api')->plainTextToken)
            ->postJson("/api/me/service-addresses/{$address->public_id}/default")
            ->assertNotFound();
    }
}
