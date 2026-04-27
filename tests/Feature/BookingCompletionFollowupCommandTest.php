<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Booking;
use App\Models\Refund;
use App\Models\ServiceAddress;
use App\Models\TherapistLedgerEntry;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class BookingCompletionFollowupCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_command_sends_completion_reminder_after_24_hours(): void
    {
        Mail::shouldReceive('raw')->once();

        [$user, , $booking] = $this->createTherapistCompletedBooking(now()->subHours(25));

        $this->artisan('bookings:follow-up-completion-confirmations')
            ->expectsOutputToContain('reminded=1')
            ->assertSuccessful();

        $this->assertDatabaseHas('notifications', [
            'account_id' => $user->id,
            'notification_type' => 'booking_completion_reminder',
            'channel' => 'in_app',
            'status' => 'sent',
        ]);
        $this->assertNotNull($booking->fresh()->completion_confirmation_reminder_sent_at);
    }

    public function test_command_auto_completes_after_72_hours_and_creates_ledger_entry(): void
    {
        Mail::shouldReceive('raw')->twice();

        [, $therapist, $booking] = $this->createTherapistCompletedBooking(now()->subHours(73));

        $this->artisan('bookings:follow-up-completion-confirmations')
            ->expectsOutputToContain('auto_completed=1')
            ->assertSuccessful();

        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => Booking::STATUS_COMPLETED,
        ]);
        $this->assertDatabaseHas('therapist_ledger_entries', [
            'booking_id' => $booking->id,
            'therapist_account_id' => $therapist->id,
            'entry_type' => TherapistLedgerEntry::TYPE_BOOKING_SALE,
            'amount_signed' => 10800,
        ]);
    }

    public function test_command_does_not_auto_complete_when_refund_exists(): void
    {
        Mail::shouldReceive('raw')->never();

        [$user, , $booking] = $this->createTherapistCompletedBooking(now()->subHours(73));

        Refund::create([
            'public_id' => 'refund_followup',
            'booking_id' => $booking->id,
            'requested_by_account_id' => $user->id,
            'status' => Refund::STATUS_REQUESTED,
            'reason_code' => 'customer_request',
            'requested_amount' => 1000,
        ]);

        $this->artisan('bookings:follow-up-completion-confirmations')
            ->expectsOutputToContain('auto_completed=0')
            ->assertSuccessful();

        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => Booking::STATUS_THERAPIST_COMPLETED,
        ]);
        $this->assertDatabaseMissing('therapist_ledger_entries', [
            'booking_id' => $booking->id,
        ]);
    }

    private function createTherapistCompletedBooking(\Illuminate\Support\Carbon $endedAt): array
    {
        $user = Account::factory()->create(['public_id' => 'acc_user_followup_'.fake()->unique()->numberBetween(1000, 9999)]);
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_followup_'.fake()->unique()->numberBetween(1000, 9999)]);

        $therapistProfile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_followup_'.fake()->unique()->numberBetween(1000, 9999),
            'public_name' => 'Followup Therapist',
            'profile_status' => 'approved',
        ]);

        $menu = TherapistMenu::create([
            'public_id' => 'menu_followup_'.fake()->unique()->numberBetween(1000, 9999),
            'therapist_profile_id' => $therapistProfile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
        ]);

        $address = ServiceAddress::create([
            'public_id' => 'addr_followup_'.fake()->unique()->numberBetween(1000, 9999),
            'account_id' => $user->id,
            'place_type' => 'hotel',
            'address_line_encrypted' => 'encrypted-address',
            'lat' => '35.6812360',
            'lng' => '139.7671250',
        ]);

        $booking = Booking::create([
            'public_id' => 'book_followup_'.fake()->unique()->numberBetween(1000, 9999),
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $address->id,
            'status' => Booking::STATUS_THERAPIST_COMPLETED,
            'duration_minutes' => 60,
            'scheduled_start_at' => $endedAt->copy()->subHour(),
            'scheduled_end_at' => $endedAt,
            'ended_at' => $endedAt,
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);

        return [$user, $therapist, $booking];
    }
}
