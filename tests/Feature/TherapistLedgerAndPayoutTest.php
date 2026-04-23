<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Booking;
use App\Models\PayoutRequest;
use App\Models\ServiceAddress;
use App\Models\StripeConnectedAccount;
use App\Models\TherapistLedgerEntry;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TherapistLedgerAndPayoutTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_completion_creates_pending_therapist_ledger_entry(): void
    {
        [$user, , $booking] = $this->createPayoutFixture(Booking::STATUS_THERAPIST_COMPLETED);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/user-complete-confirmation")
            ->assertOk()
            ->assertJsonPath('data.status', Booking::STATUS_COMPLETED);

        $this->assertDatabaseHas('therapist_ledger_entries', [
            'therapist_account_id' => $booking->therapist_account_id,
            'booking_id' => $booking->id,
            'entry_type' => TherapistLedgerEntry::TYPE_BOOKING_SALE,
            'amount_signed' => 10800,
            'status' => TherapistLedgerEntry::STATUS_PENDING,
        ]);
    }

    public function test_therapist_can_view_ledger_summary(): void
    {
        [, $therapist, $booking] = $this->createPayoutFixture();

        TherapistLedgerEntry::create([
            'therapist_account_id' => $therapist->id,
            'booking_id' => $booking->id,
            'entry_type' => TherapistLedgerEntry::TYPE_BOOKING_SALE,
            'amount_signed' => 10800,
            'status' => TherapistLedgerEntry::STATUS_AVAILABLE,
            'available_at' => now()->subMinute(),
        ]);
        TherapistLedgerEntry::create([
            'therapist_account_id' => $therapist->id,
            'booking_id' => $booking->id,
            'entry_type' => TherapistLedgerEntry::TYPE_BOOKING_SALE,
            'amount_signed' => 5000,
            'status' => TherapistLedgerEntry::STATUS_PENDING,
            'available_at' => now()->addDays(7),
        ]);

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->getJson('/api/me/therapist/ledger')
            ->assertOk()
            ->assertJsonPath('data.summary.available_amount', 10800)
            ->assertJsonPath('data.summary.pending_amount', 5000)
            ->assertJsonCount(2, 'data.entries');
    }

    public function test_therapist_can_request_full_available_payout(): void
    {
        [, $therapist, $booking, $connectedAccount] = $this->createPayoutFixture();

        TherapistLedgerEntry::create([
            'therapist_account_id' => $therapist->id,
            'booking_id' => $booking->id,
            'entry_type' => TherapistLedgerEntry::TYPE_BOOKING_SALE,
            'amount_signed' => 10800,
            'status' => TherapistLedgerEntry::STATUS_AVAILABLE,
            'available_at' => now()->subMinute(),
        ]);

        $payoutId = $this->withToken($therapist->createToken('api')->plainTextToken)
            ->postJson('/api/me/therapist/payout-requests', [
                'requested_amount' => 10800,
            ])
            ->assertCreated()
            ->assertJsonPath('data.status', PayoutRequest::STATUS_REQUESTED)
            ->assertJsonPath('data.requested_amount', 10800)
            ->assertJsonPath('data.net_amount', 10800)
            ->assertJsonPath('data.scheduled_process_date', fn ($value) => filled($value))
            ->json('data.public_id');

        $this->assertDatabaseHas('payout_requests', [
            'public_id' => $payoutId,
            'therapist_account_id' => $therapist->id,
            'stripe_connected_account_id' => $connectedAccount->id,
            'status' => PayoutRequest::STATUS_REQUESTED,
            'requested_amount' => 10800,
        ]);
        $this->assertDatabaseHas('therapist_ledger_entries', [
            'therapist_account_id' => $therapist->id,
            'booking_id' => $booking->id,
            'status' => TherapistLedgerEntry::STATUS_PAYOUT_REQUESTED,
        ]);
    }

    public function test_payout_requires_active_connected_account(): void
    {
        [, $therapist] = $this->createPayoutFixture(connectedAccountStatus: StripeConnectedAccount::STATUS_REQUIREMENTS_DUE);

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->postJson('/api/me/therapist/payout-requests', [
                'requested_amount' => 1000,
            ])
            ->assertConflict();
    }

    private function createPayoutFixture(
        string $bookingStatus = Booking::STATUS_COMPLETED,
        string $connectedAccountStatus = StripeConnectedAccount::STATUS_ACTIVE,
    ): array {
        $user = Account::factory()->create(['public_id' => 'acc_user_payout']);
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_payout']);

        $therapistProfile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_payout',
            'public_name' => 'Payout Therapist',
            'profile_status' => 'approved',
        ]);

        $connectedAccount = StripeConnectedAccount::create([
            'account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'stripe_account_id' => 'acct_payout',
            'account_type' => 'express',
            'status' => $connectedAccountStatus,
            'charges_enabled' => $connectedAccountStatus === StripeConnectedAccount::STATUS_ACTIVE,
            'payouts_enabled' => $connectedAccountStatus === StripeConnectedAccount::STATUS_ACTIVE,
            'details_submitted' => true,
        ]);

        $menu = TherapistMenu::create([
            'public_id' => 'menu_payout_60',
            'therapist_profile_id' => $therapistProfile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
        ]);

        $address = ServiceAddress::create([
            'public_id' => 'addr_payout',
            'account_id' => $user->id,
            'place_type' => 'hotel',
            'address_line_encrypted' => 'encrypted-address',
            'lat' => '35.6812360',
            'lng' => '139.7671250',
        ]);

        $booking = Booking::create([
            'public_id' => 'book_payout',
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $address->id,
            'status' => $bookingStatus,
            'duration_minutes' => 60,
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);

        return [$user, $therapist, $booking, $connectedAccount];
    }
}
