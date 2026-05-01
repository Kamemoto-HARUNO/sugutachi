<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\BookingQuote;
use App\Models\ServiceAddress;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class BookingStartReminderCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_command_sends_due_prepare_and_departure_reminders(): void
    {
        Mail::shouldReceive('raw')->twice();

        [, $therapist, $booking] = $this->createAcceptedScheduledBooking();

        $this->travelTo($this->jstUtc('2030-01-06 19:00:00'));

        $this->artisan('bookings:send-start-reminders')
            ->expectsOutputToContain('prepare=1 departure=0')
            ->assertSuccessful();

        $booking->refresh();

        $this->assertNotNull($booking->therapist_pre_departure_reminder_sent_at);
        $this->assertNull($booking->therapist_departure_reminder_sent_at);

        $this->travelTo($this->jstUtc('2030-01-06 20:00:00'));

        $this->artisan('bookings:send-start-reminders')
            ->expectsOutputToContain('prepare=0 departure=1')
            ->assertSuccessful();

        $booking->refresh();

        $this->assertNotNull($booking->therapist_departure_reminder_sent_at);

        $notifications = AppNotification::query()
            ->where('account_id', $therapist->id)
            ->where('notification_type', 'booking_start_reminder')
            ->orderBy('id')
            ->get();

        $this->assertCount(2, $notifications);
        $this->assertSame('pre_departure', data_get($notifications[0]->data_json, 'reminder_stage'));
        $this->assertSame('departure', data_get($notifications[1]->data_json, 'reminder_stage'));
        $this->assertSame($booking->public_id, data_get($notifications[0]->data_json, 'booking_public_id'));
    }

    public function test_command_skips_reminders_that_are_already_past_when_booking_was_confirmed(): void
    {
        Mail::shouldReceive('raw')->never();

        [, $therapist, $booking] = $this->createAcceptedScheduledBooking(
            confirmedAt: $this->jstUtc('2030-01-06 20:30:00'),
        );

        $this->travelTo($this->jstUtc('2030-01-06 20:45:00'));

        $this->artisan('bookings:send-start-reminders')
            ->expectsOutputToContain('prepare=0 departure=0')
            ->assertSuccessful();

        $booking->refresh();

        $this->assertNotNull($booking->therapist_pre_departure_reminder_sent_at);
        $this->assertNotNull($booking->therapist_departure_reminder_sent_at);
        $this->assertDatabaseMissing('notifications', [
            'account_id' => $therapist->id,
            'notification_type' => 'booking_start_reminder',
        ]);
    }

    private function createAcceptedScheduledBooking(
        int $walkingTimeMinutes = 60,
        ?CarbonImmutable $confirmedAt = null,
    ): array {
        $confirmedAt ??= $this->jstUtc('2030-01-06 18:00:00');

        $user = Account::factory()->create(['public_id' => 'acc_user_start_reminder_'.fake()->unique()->numberBetween(1000, 9999)]);
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_start_reminder_'.fake()->unique()->numberBetween(1000, 9999)]);

        $therapistProfile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_start_reminder_'.fake()->unique()->numberBetween(1000, 9999),
            'public_name' => 'Reminder Therapist',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
        ]);

        $menu = TherapistMenu::create([
            'public_id' => 'menu_start_reminder_'.fake()->unique()->numberBetween(1000, 9999),
            'therapist_profile_id' => $therapistProfile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
        ]);

        $address = ServiceAddress::create([
            'public_id' => 'addr_start_reminder_'.fake()->unique()->numberBetween(1000, 9999),
            'account_id' => $user->id,
            'place_type' => 'hotel',
            'address_line_encrypted' => 'encrypted-address',
            'lat' => '35.6812360',
            'lng' => '139.7671250',
        ]);

        $booking = Booking::create([
            'public_id' => 'book_start_reminder_'.fake()->unique()->numberBetween(1000, 9999),
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $address->id,
            'status' => Booking::STATUS_ACCEPTED,
            'is_on_demand' => false,
            'requested_start_at' => $this->jstUtc('2030-01-06 21:00:00'),
            'scheduled_start_at' => $this->jstUtc('2030-01-06 21:00:00'),
            'scheduled_end_at' => $this->jstUtc('2030-01-06 22:00:00'),
            'accepted_at' => $confirmedAt,
            'confirmed_at' => $confirmedAt,
            'duration_minutes' => 60,
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);

        $quote = BookingQuote::create([
            'public_id' => 'quote_'.$booking->public_id,
            'booking_id' => $booking->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $menu->id,
            'duration_minutes' => 60,
            'base_amount' => 12000,
            'travel_fee_amount' => 0,
            'night_fee_amount' => 0,
            'demand_fee_amount' => 0,
            'profile_adjustment_amount' => 0,
            'matching_fee_amount' => 300,
            'platform_fee_amount' => 1200,
            'total_amount' => 12300,
            'therapist_gross_amount' => 12000,
            'therapist_net_amount' => 10800,
            'calculation_version' => 'test',
            'input_snapshot_json' => [
                'service_address_id' => $address->public_id,
                'therapist_profile_id' => $therapistProfile->public_id,
                'therapist_menu_id' => $menu->public_id,
                'duration_minutes' => 60,
                'is_on_demand' => false,
                'walking_time_minutes' => $walkingTimeMinutes,
                'walking_time_range' => 'within_60_min',
                'travel_mode' => 'walking',
            ],
            'applied_rules_json' => [],
            'expires_at' => $confirmedAt->addMinutes(30),
        ]);

        $booking->update([
            'current_quote_id' => $quote->id,
        ]);

        return [$user, $therapist, $booking];
    }

    private function jstUtc(string $dateTime): CarbonImmutable
    {
        return CarbonImmutable::parse($dateTime, 'Asia/Tokyo')->utc();
    }
}
