<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\AccountBlock;
use App\Models\Booking;
use App\Models\Report;
use App\Models\ServiceAddress;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReportAndBlockApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_booking_participant_can_create_and_view_report(): void
    {
        [$user, $therapist, $booking] = $this->createReportFixture();

        $reportId = $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson('/api/reports', [
                'booking_id' => $booking->public_id,
                'target_account_id' => $therapist->public_id,
                'category' => 'prohibited_request',
                'severity' => Report::SEVERITY_HIGH,
                'detail' => 'The participant asked to move outside platform rules.',
            ])
            ->assertCreated()
            ->assertJsonPath('data.booking_public_id', $booking->public_id)
            ->assertJsonPath('data.reporter_account_id', $user->public_id)
            ->assertJsonPath('data.target_account_id', $therapist->public_id)
            ->assertJsonPath('data.category', 'prohibited_request')
            ->assertJsonPath('data.severity', Report::SEVERITY_HIGH)
            ->assertJsonPath('data.status', Report::STATUS_OPEN)
            ->json('data.public_id');

        $this->assertDatabaseHas('reports', [
            'public_id' => $reportId,
            'booking_id' => $booking->id,
            'reporter_account_id' => $user->id,
            'target_account_id' => $therapist->id,
            'status' => Report::STATUS_OPEN,
        ]);
        $this->assertDatabaseHas('report_actions', [
            'report_id' => Report::query()->where('public_id', $reportId)->value('id'),
            'action_type' => 'report_created',
        ]);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->getJson("/api/reports/{$reportId}")
            ->assertOk()
            ->assertJsonPath('data.public_id', $reportId);
    }

    public function test_report_rejects_non_participant(): void
    {
        [, , $booking] = $this->createReportFixture();
        $other = Account::factory()->create(['public_id' => 'acc_report_other']);

        $this->withToken($other->createToken('api')->plainTextToken)
            ->postJson('/api/reports', [
                'booking_id' => $booking->public_id,
                'category' => 'violence',
            ])
            ->assertNotFound();
    }

    public function test_report_rejects_invalid_booking_target(): void
    {
        [$user, , $booking] = $this->createReportFixture();
        $unrelated = Account::factory()->create(['public_id' => 'acc_report_unrelated']);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson('/api/reports', [
                'booking_id' => $booking->public_id,
                'target_account_id' => $unrelated->public_id,
                'category' => 'violence',
            ])
            ->assertUnprocessable();
    }

    public function test_account_can_block_update_and_unblock_another_account(): void
    {
        $user = Account::factory()->create(['public_id' => 'acc_block_user']);
        $target = Account::factory()->create(['public_id' => 'acc_block_target']);
        $token = $user->createToken('api')->plainTextToken;

        $blockId = $this->withToken($token)
            ->postJson("/api/accounts/{$target->public_id}/block", [
                'reason_code' => 'unsafe',
            ])
            ->assertCreated()
            ->assertJsonPath('data.blocker_account_id', $user->public_id)
            ->assertJsonPath('data.blocked_account_id', $target->public_id)
            ->assertJsonPath('data.reason_code', 'unsafe')
            ->json('data.id');

        $this->withToken($token)
            ->postJson("/api/accounts/{$target->public_id}/block", [
                'reason_code' => 'external_contact',
            ])
            ->assertOk()
            ->assertJsonPath('data.id', $blockId)
            ->assertJsonPath('data.reason_code', 'external_contact');

        $this->assertDatabaseHas('account_blocks', [
            'id' => $blockId,
            'blocker_account_id' => $user->id,
            'blocked_account_id' => $target->id,
            'reason_code' => 'external_contact',
        ]);

        $this->withToken($token)
            ->deleteJson("/api/accounts/{$target->public_id}/block")
            ->assertNoContent();

        $this->assertFalse(AccountBlock::query()->whereKey($blockId)->exists());
    }

    private function createReportFixture(): array
    {
        $user = Account::factory()->create(['public_id' => 'acc_user_report']);
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_report']);

        $therapistProfile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_report',
            'public_name' => 'Report Therapist',
            'profile_status' => 'approved',
        ]);

        $menu = TherapistMenu::create([
            'public_id' => 'menu_report_60',
            'therapist_profile_id' => $therapistProfile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
        ]);

        $address = ServiceAddress::create([
            'public_id' => 'addr_report',
            'account_id' => $user->id,
            'place_type' => 'hotel',
            'address_line_encrypted' => 'encrypted-address',
            'lat' => '35.6812360',
            'lng' => '139.7671250',
        ]);

        $booking = Booking::create([
            'public_id' => 'book_report',
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $address->id,
            'status' => Booking::STATUS_COMPLETED,
            'duration_minutes' => 60,
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);

        return [$user, $therapist, $booking];
    }
}
