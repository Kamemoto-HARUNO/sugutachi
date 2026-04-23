<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Booking;
use App\Models\BookingQuote;
use App\Models\PaymentIntent;
use App\Models\ServiceAddress;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use App\Models\UserProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ModelRelationshipTest extends TestCase
{
    use RefreshDatabase;

    public function test_core_marketplace_models_are_connected(): void
    {
        $user = Account::factory()->create(['public_id' => 'acc_user']);
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist']);

        $userProfile = UserProfile::create([
            'account_id' => $user->id,
            'profile_status' => 'active',
            'preferences_json' => ['strength' => 'medium'],
            'touch_ng_json' => [],
        ]);

        $therapistProfile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_main',
            'public_name' => 'Test Therapist',
            'profile_status' => 'approved',
        ]);

        $menu = TherapistMenu::create([
            'public_id' => 'menu_bodycare_60',
            'therapist_profile_id' => $therapistProfile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
        ]);

        $address = ServiceAddress::create([
            'public_id' => 'addr_main',
            'account_id' => $user->id,
            'place_type' => 'hotel',
            'address_line_encrypted' => 'encrypted-address',
            'lat' => '35.6812360',
            'lng' => '139.7671250',
        ]);

        $booking = Booking::create([
            'public_id' => 'book_main',
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $address->id,
            'status' => 'requested',
            'duration_minutes' => 60,
            'total_amount' => 13200,
        ]);

        $quote = BookingQuote::create([
            'public_id' => 'quote_main',
            'booking_id' => $booking->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $menu->id,
            'duration_minutes' => 60,
            'base_amount' => 12000,
            'matching_fee_amount' => 1200,
            'total_amount' => 13200,
            'therapist_gross_amount' => 12000,
            'therapist_net_amount' => 10000,
            'calculation_version' => 'test-v1',
            'input_snapshot_json' => ['distance_minutes' => 20],
            'applied_rules_json' => [],
        ]);

        $booking->update(['current_quote_id' => $quote->id]);

        $paymentIntent = PaymentIntent::create([
            'booking_id' => $booking->id,
            'payer_account_id' => $user->id,
            'stripe_payment_intent_id' => 'pi_test_main',
            'status' => 'requires_capture',
            'amount' => 13200,
        ]);

        $this->assertTrue($user->userProfile->is($userProfile));
        $this->assertTrue($therapist->therapistProfile->is($therapistProfile));
        $this->assertTrue($booking->userAccount->is($user));
        $this->assertTrue($booking->therapistProfile->is($therapistProfile));
        $this->assertTrue($booking->currentQuote->is($quote));
        $this->assertTrue($paymentIntent->booking->is($booking));
        $this->assertSame('public_id', $booking->getRouteKeyName());
        $this->assertSame('public_id', $therapistProfile->getRouteKeyName());
    }
}
