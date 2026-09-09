<?php

namespace Tests\Feature;

use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\CreatesDirectMessageFixtures;
use Tests\TestCase;

class DirectMessageReceptionDefaultTest extends TestCase
{
    use CreatesDirectMessageFixtures;
    use RefreshDatabase;

    public function test_new_profiles_accept_dm_by_default_and_can_opt_out(): void
    {
        config(['direct_messages.enabled' => true]);
        $cast = $this->dual('Default');
        $cast->therapistProfile->delete();
        $profile = TherapistProfile::create(['account_id' => $cast->id, 'public_id' => 'thp_default_reception', 'public_name' => '初期受付']);
        $this->assertTrue($profile->consultation_enabled);
        $this->assertTrue($profile->fresh()->consultation_enabled);
        $cast->unsetRelation('therapistProfile');
        $this->asAccount($cast)->patchJson('/api/therapist/direct-messages/settings', ['consultation_enabled' => false])
            ->assertOk()->assertJsonPath('data.consultation_enabled', false);
        $this->getJson('/api/therapist/direct-messages/settings')->assertOk()->assertJsonPath('data.consultation_enabled', false);
        $this->assertFalse($profile->fresh()->consultation_enabled);
    }

    public function test_database_default_is_on_without_model_defaults(): void
    {
        $cast = $this->dual('Database');
        $cast->therapistProfile->delete();
        $id = DB::table('therapist_profiles')->insertGetId(['account_id' => $cast->id, 'public_id' => 'thp_database_default', 'public_name' => 'DB初期受付']);
        $this->assertTrue(TherapistProfile::findOrFail($id)->consultation_enabled);
    }

    public function test_changing_default_preserves_existing_on_and_off_choices(): void
    {
        $on = $this->dual('On')->therapistProfile;
        $off = $this->dual('Off')->therapistProfile;
        $off->update(['consultation_enabled' => false]);
        $migration = require database_path('migrations/2026_09_09_000001_enable_direct_message_reception_by_default.php');
        $migration->down();
        $migration->up();
        $this->assertTrue($on->fresh()->consultation_enabled);
        $this->assertFalse($off->fresh()->consultation_enabled);
    }
}
