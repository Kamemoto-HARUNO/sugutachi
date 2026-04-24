<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Booking;
use App\Models\PaymentIntent;
use App\Models\ServiceAddress;
use App\Models\StripeDispute;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Tests\TestCase;

class AdminStripeDisputeTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_stripe_disputes_with_filters(): void
    {
        [$admin, $booking, $paymentIntent] = $this->createDisputeFixture();

        StripeDispute::create([
            'booking_id' => $booking->id,
            'payment_intent_id' => $paymentIntent->id,
            'stripe_dispute_id' => 'dp_admin_won',
            'status' => StripeDispute::STATUS_WON,
            'reason' => 'fraudulent',
            'amount' => 12000,
            'currency' => 'jpy',
            'evidence_due_by' => now()->addDays(3),
            'outcome' => 'won',
            'last_stripe_event_id' => 'evt_admin_won',
        ]);

        $this->withToken($admin->createToken('api')->plainTextToken)
            ->getJson("/api/admin/stripe-disputes?booking_id={$booking->public_id}&status=needs_response&sort=evidence_due_by&direction=asc")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.stripe_dispute_id', 'dp_admin_open')
            ->assertJsonPath('data.0.booking_public_id', $booking->public_id)
            ->assertJsonPath('data.0.payment_intent.stripe_payment_intent_id', $paymentIntent->stripe_payment_intent_id)
            ->assertJsonPath('data.0.user_account_id', $booking->userAccount->public_id)
            ->assertJsonPath('data.0.therapist_account_id', $booking->therapistAccount->public_id);
    }

    public function test_non_admin_cannot_access_stripe_disputes_admin_api(): void
    {
        [, $booking] = $this->createDisputeFixture();

        $this->withToken($booking->userAccount->createToken('api')->plainTextToken)
            ->getJson('/api/admin/stripe-disputes')
            ->assertForbidden();
    }

    private function createDisputeFixture(): array
    {
        $admin = Account::factory()->create(['public_id' => 'acc_admin_dispute']);
        $admin->roleAssignments()->create([
            'role' => 'admin',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        $user = Account::factory()->create(['public_id' => 'acc_user_dispute']);
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_dispute']);

        $therapistProfile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_dispute_admin',
            'public_name' => 'Dispute Therapist',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
        ]);
        $menu = TherapistMenu::create([
            'public_id' => 'menu_dispute_admin',
            'therapist_profile_id' => $therapistProfile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
        ]);
        $address = ServiceAddress::create([
            'public_id' => 'addr_dispute_admin',
            'account_id' => $user->id,
            'place_type' => 'hotel',
            'address_line_encrypted' => Crypt::encryptString('Tokyo Hotel'),
            'lat' => '35.6812360',
            'lng' => '139.7671250',
        ]);

        $booking = Booking::create([
            'public_id' => 'book_dispute_admin',
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

        $paymentIntent = PaymentIntent::create([
            'booking_id' => $booking->id,
            'payer_account_id' => $user->id,
            'stripe_payment_intent_id' => 'pi_dispute_admin',
            'status' => 'succeeded',
            'capture_method' => 'manual',
            'currency' => 'jpy',
            'amount' => 12300,
            'application_fee_amount' => 1500,
            'transfer_amount' => 10800,
            'is_current' => true,
        ]);

        StripeDispute::create([
            'booking_id' => $booking->id,
            'payment_intent_id' => $paymentIntent->id,
            'stripe_dispute_id' => 'dp_admin_open',
            'status' => StripeDispute::STATUS_NEEDS_RESPONSE,
            'reason' => 'fraudulent',
            'amount' => 12300,
            'currency' => 'jpy',
            'evidence_due_by' => now()->addDays(7),
            'last_stripe_event_id' => 'evt_admin_open',
        ]);

        return [$admin, $booking, $paymentIntent];
    }
}
