<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\IdentityVerification;
use App\Models\TherapistLocation;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GayMassageAreaSeoTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_areas_with_public_therapists_are_returned(): void
    {
        $profile = $this->createPublicTherapistAt('thp_fukuoka', 'Fukuoka Therapist', 33.5902000, 130.4017000);

        $this->getJson('/api/gay-massage-areas')
            ->assertOk()
            ->assertJsonCount(1, 'data.areas')
            ->assertJsonPath('data.areas.0.slug', 'fukuoka');

        $this->getJson('/api/gay-massage-areas/fukuoka')
            ->assertOk()
            ->assertJsonPath('data.area.slug', 'fukuoka')
            ->assertJsonPath('data.area.therapist_count', 1)
            ->assertJsonPath('data.therapists.0.public_id', $profile->public_id);

        $this->getJson('/api/gay-massage-areas/tokyo')->assertNotFound();
    }

    public function test_empty_area_page_is_not_served_to_crawlers(): void
    {
        $this->createPublicTherapistAt('thp_fukuoka', 'Fukuoka Therapist', 33.5902000, 130.4017000);

        $this->get('/gay-massage/fukuoka')->assertOk();
        $this->get('/gay-massage/tokyo')->assertNotFound();
    }

    public function test_sitemap_includes_only_active_area_pages(): void
    {
        $this->createPublicTherapistAt('thp_fukuoka', 'Fukuoka Therapist', 33.5902000, 130.4017000);

        $response = $this->get('/sitemap.xml')->assertOk();

        $response->assertSee('/gay-massage/fukuoka', false);
        $response->assertDontSee('/gay-massage/tokyo', false);
        $response->assertDontSee('/gay-massage/osaka', false);
        $response->assertDontSee('/gay-massage/aichi', false);
    }

    private function createPublicTherapistAt(string $publicId, string $name, float $lat, float $lng): TherapistProfile
    {
        $account = Account::factory()->create();

        IdentityVerification::create([
            'account_id' => $account->id,
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);

        $profile = TherapistProfile::create([
            'account_id' => $account->id,
            'public_id' => $publicId,
            'public_name' => $name,
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'is_online' => true,
            'is_listed' => true,
            'rating_average' => 4.8,
            'review_count' => 3,
            'approved_at' => now(),
        ]);

        TherapistMenu::create([
            'therapist_profile_id' => $profile->id,
            'public_id' => 'menu_'.$publicId,
            'name' => 'Body Care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
            'is_active' => true,
        ]);

        TherapistLocation::create([
            'therapist_profile_id' => $profile->id,
            'lat' => $lat,
            'lng' => $lng,
            'is_searchable' => true,
        ]);

        return $profile;
    }
}
