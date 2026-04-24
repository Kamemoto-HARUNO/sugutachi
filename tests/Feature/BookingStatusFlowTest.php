<?php

namespace Tests\Feature;

use App\Contracts\Payments\CreatedPaymentIntent;
use App\Contracts\Payments\PaymentIntentGateway;
use App\Models\Account;
use App\Models\Booking;
use App\Models\BookingQuote;
use App\Models\IdentityVerification;
use App\Models\PaymentIntent;
use App\Models\ServiceAddress;
use App\Models\StripeConnectedAccount;
use App\Models\TherapistAvailabilitySlot;
use App\Models\TherapistBookingSetting;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BookingStatusFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_therapist_and_user_can_advance_booking_statuses(): void
    {
        [$user, $therapist, $booking] = $this->createRequestedBooking();

        $userToken = $user->createToken('api')->plainTextToken;
        $therapistToken = $therapist->createToken('api')->plainTextToken;

        $this->withToken($therapistToken)
            ->getJson('/api/me/therapist/booking-requests')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $booking->public_id);

        $this->withToken($therapistToken)
            ->postJson("/api/bookings/{$booking->public_id}/accept")
            ->assertOk()
            ->assertJsonPath('data.status', Booking::STATUS_ACCEPTED)
            ->assertJsonPath('data.accepted_at', fn ($value) => filled($value));

        $this->withToken($therapistToken)
            ->postJson("/api/bookings/{$booking->public_id}/start")
            ->assertConflict();

        $this->withToken($therapistToken)
            ->postJson("/api/bookings/{$booking->public_id}/moving")
            ->assertOk()
            ->assertJsonPath('data.status', Booking::STATUS_MOVING);

        $this->withToken($therapistToken)
            ->postJson("/api/bookings/{$booking->public_id}/arrived")
            ->assertOk()
            ->assertJsonPath('data.status', Booking::STATUS_ARRIVED);

        $this->withToken($therapistToken)
            ->postJson("/api/bookings/{$booking->public_id}/start")
            ->assertOk()
            ->assertJsonPath('data.status', Booking::STATUS_IN_PROGRESS);

        $this->withToken($therapistToken)
            ->postJson("/api/bookings/{$booking->public_id}/complete")
            ->assertOk()
            ->assertJsonPath('data.status', Booking::STATUS_THERAPIST_COMPLETED)
            ->assertJsonPath('data.ended_at', fn ($value) => filled($value));

        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => Booking::STATUS_THERAPIST_COMPLETED,
        ]);

        $this->assertDatabaseCount('booking_status_logs', 5);
    }

    public function test_user_cannot_accept_booking_as_therapist(): void
    {
        [$user, , $booking] = $this->createRequestedBooking();

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/accept")
            ->assertNotFound();
    }

    public function test_therapist_can_reject_requested_booking(): void
    {
        $gatewayState = (object) ['canceledStripeIds' => []];
        $this->bindPaymentIntentGateway($gatewayState);

        [, $therapist, $booking, $paymentIntent] = $this->createRequestedBooking(withPaymentIntent: true);

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/reject")
            ->assertOk()
            ->assertJsonPath('data.status', Booking::STATUS_REJECTED)
            ->assertJsonPath('data.cancel_reason_code', 'therapist_rejected');

        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => Booking::STATUS_REJECTED,
            'cancel_reason_code' => 'therapist_rejected',
        ]);
        $this->assertDatabaseHas('payment_intents', [
            'id' => $paymentIntent->id,
            'status' => PaymentIntent::STRIPE_STATUS_CANCELED,
            'last_stripe_event_id' => 'system.therapist_rejected',
        ]);
        $this->assertSame([$paymentIntent->stripe_payment_intent_id], $gatewayState->canceledStripeIds);
    }

    public function test_user_can_confirm_therapist_completed_booking(): void
    {
        [$user, , $booking] = $this->createRequestedBooking();

        $booking->update([
            'status' => Booking::STATUS_THERAPIST_COMPLETED,
            'ended_at' => now(),
        ]);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/user-complete-confirmation")
            ->assertOk()
            ->assertJsonPath('data.status', Booking::STATUS_COMPLETED);

        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => Booking::STATUS_COMPLETED,
        ]);
    }

    public function test_scheduled_accept_requires_buffers(): void
    {
        [, $therapist, $booking] = $this->createRequestedScheduledBooking();

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/accept")
            ->assertStatus(422)
            ->assertJsonValidationErrors(['buffer_before_minutes', 'buffer_after_minutes']);
    }

    public function test_scheduled_accept_rejects_overlap_when_buffers_are_applied(): void
    {
        [$user, $therapist, $booking] = $this->createRequestedScheduledBooking();

        Booking::create([
            'public_id' => 'book_scheduled_conflict',
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $booking->therapist_profile_id,
            'therapist_menu_id' => $booking->therapist_menu_id,
            'service_address_id' => $booking->service_address_id,
            'status' => Booking::STATUS_ACCEPTED,
            'is_on_demand' => false,
            'requested_start_at' => CarbonImmutable::parse('2030-01-06 15:45:00'),
            'scheduled_start_at' => CarbonImmutable::parse('2030-01-06 15:45:00'),
            'scheduled_end_at' => CarbonImmutable::parse('2030-01-06 16:45:00'),
            'duration_minutes' => 60,
            'buffer_before_minutes' => 30,
            'buffer_after_minutes' => 30,
            'accepted_at' => now(),
            'confirmed_at' => now(),
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/accept", [
                'buffer_before_minutes' => 30,
                'buffer_after_minutes' => 30,
            ])
            ->assertConflict();
    }

    public function test_scheduled_accept_rejects_when_active_on_demand_booking_exists_within_six_hours(): void
    {
        $this->travelTo(CarbonImmutable::parse('2030-01-06 10:00:00'));

        [$user, $therapist, $booking] = $this->createRequestedScheduledBooking();

        Booking::create([
            'public_id' => 'book_active_ondemand_accept',
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $booking->therapist_profile_id,
            'therapist_menu_id' => $booking->therapist_menu_id,
            'service_address_id' => $booking->service_address_id,
            'status' => Booking::STATUS_ACCEPTED,
            'is_on_demand' => true,
            'requested_start_at' => CarbonImmutable::parse('2030-01-06 10:30:00'),
            'duration_minutes' => 60,
            'accepted_at' => now(),
            'confirmed_at' => now(),
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/accept", [
                'buffer_before_minutes' => 15,
                'buffer_after_minutes' => 15,
            ])
            ->assertConflict();
    }

    public function test_therapist_request_list_includes_operational_context_for_scheduled_request(): void
    {
        $this->travelTo(CarbonImmutable::parse('2030-01-06 10:00:00'));

        [, $therapist, $booking] = $this->createRequestedScheduledBooking();

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->getJson('/api/me/therapist/booking-requests')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $booking->public_id)
            ->assertJsonPath('data.0.request_type', 'scheduled')
            ->assertJsonPath('data.0.dispatch_area_label', '天神周辺')
            ->assertJsonPath('data.0.menu.name', 'Body care 60')
            ->assertJsonPath('data.0.service_location.prefecture', '福岡県')
            ->assertJsonPath('data.0.service_location.city', '福岡市中央区')
            ->assertJsonPath('data.0.request_expires_in_seconds', 21600)
            ->assertJsonPath('data.0.request_expires_in_minutes', 360);
    }

    private function createRequestedBooking(bool $withPaymentIntent = false): array
    {
        $user = Account::factory()->create(['public_id' => 'acc_user_'.fake()->unique()->numberBetween(1000, 9999)]);
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_'.fake()->unique()->numberBetween(1000, 9999)]);

        $therapistProfile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_'.fake()->unique()->numberBetween(1000, 9999),
            'public_name' => 'Test Therapist',
            'profile_status' => 'approved',
        ]);

        $menu = TherapistMenu::create([
            'public_id' => 'menu_'.fake()->unique()->numberBetween(1000, 9999),
            'therapist_profile_id' => $therapistProfile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
        ]);

        $address = ServiceAddress::create([
            'public_id' => 'addr_'.fake()->unique()->numberBetween(1000, 9999),
            'account_id' => $user->id,
            'place_type' => 'hotel',
            'address_line_encrypted' => 'encrypted-address',
            'lat' => '35.6812360',
            'lng' => '139.7671250',
        ]);

        $booking = Booking::create([
            'public_id' => 'book_'.fake()->unique()->numberBetween(1000, 9999),
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $address->id,
            'status' => Booking::STATUS_REQUESTED,
            'duration_minutes' => 60,
            'request_expires_at' => now()->addMinutes(10),
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);

        $paymentIntent = $withPaymentIntent
            ? PaymentIntent::create([
                'booking_id' => $booking->id,
                'payer_account_id' => $user->id,
                'stripe_payment_intent_id' => 'pi_'.$booking->public_id,
                'status' => PaymentIntent::STRIPE_STATUS_REQUIRES_CAPTURE,
                'capture_method' => 'manual',
                'currency' => 'jpy',
                'amount' => 12300,
                'application_fee_amount' => 1500,
                'transfer_amount' => 10800,
                'is_current' => true,
                'authorized_at' => now()->subMinute(),
            ])
            : null;

        return [$user, $therapist, $booking, $paymentIntent];
    }

    private function createRequestedScheduledBooking(): array
    {
        $user = Account::factory()->create(['public_id' => 'acc_user_sched_'.fake()->unique()->numberBetween(1000, 9999)]);
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_sched_'.fake()->unique()->numberBetween(1000, 9999)]);

        IdentityVerification::create([
            'account_id' => $therapist->id,
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);

        $therapistProfile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_sched_'.fake()->unique()->numberBetween(1000, 9999),
            'public_name' => 'Scheduled Therapist',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'photo_review_status' => 'approved',
        ]);

        TherapistBookingSetting::create([
            'therapist_profile_id' => $therapistProfile->id,
            'booking_request_lead_time_minutes' => 60,
            'scheduled_base_label' => 'Tenjin Base',
            'scheduled_base_lat' => '33.5907000',
            'scheduled_base_lng' => '130.4020000',
        ]);

        $menu = TherapistMenu::create([
            'public_id' => 'menu_sched_'.fake()->unique()->numberBetween(1000, 9999),
            'therapist_profile_id' => $therapistProfile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
        ]);

        $address = ServiceAddress::create([
            'public_id' => 'addr_sched_'.fake()->unique()->numberBetween(1000, 9999),
            'account_id' => $user->id,
            'place_type' => 'hotel',
            'prefecture' => '福岡県',
            'city' => '福岡市中央区',
            'address_line_encrypted' => 'encrypted-address',
            'lat' => '35.6812360',
            'lng' => '139.7671250',
        ]);

        $slot = TherapistAvailabilitySlot::create([
            'public_id' => 'slot_sched_'.fake()->unique()->numberBetween(1000, 9999),
            'therapist_profile_id' => $therapistProfile->id,
            'start_at' => CarbonImmutable::parse('2030-01-06 14:00:00'),
            'end_at' => CarbonImmutable::parse('2030-01-06 18:00:00'),
            'status' => TherapistAvailabilitySlot::STATUS_PUBLISHED,
            'dispatch_base_type' => TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_DEFAULT,
            'dispatch_area_label' => '天神周辺',
        ]);

        $booking = Booking::create([
            'public_id' => 'book_sched_'.fake()->unique()->numberBetween(1000, 9999),
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $address->id,
            'availability_slot_id' => $slot->id,
            'status' => Booking::STATUS_REQUESTED,
            'is_on_demand' => false,
            'requested_start_at' => CarbonImmutable::parse('2030-01-06 14:30:00'),
            'scheduled_start_at' => CarbonImmutable::parse('2030-01-06 14:30:00'),
            'scheduled_end_at' => CarbonImmutable::parse('2030-01-06 15:30:00'),
            'duration_minutes' => 60,
            'buffer_before_minutes' => 0,
            'buffer_after_minutes' => 0,
            'request_expires_at' => now()->addHours(6),
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);

        return [$user, $therapist, $booking];
    }

    private function bindPaymentIntentGateway(object $gatewayState): void
    {
        $this->app->bind(PaymentIntentGateway::class, fn () => new class($gatewayState) implements PaymentIntentGateway
        {
            public function __construct(
                private readonly object $gatewayState,
            ) {}

            public function create(
                Booking $booking,
                BookingQuote $quote,
                ?StripeConnectedAccount $connectedAccount = null,
            ): CreatedPaymentIntent {
                return new CreatedPaymentIntent(
                    id: 'pi_unused_'.$booking->public_id,
                    clientSecret: null,
                    status: 'requires_payment_method',
                );
            }

            public function capture(PaymentIntent $paymentIntent): string
            {
                return PaymentIntent::STRIPE_STATUS_SUCCEEDED;
            }

            public function cancel(PaymentIntent $paymentIntent): string
            {
                $this->gatewayState->canceledStripeIds[] = $paymentIntent->stripe_payment_intent_id;

                return PaymentIntent::STRIPE_STATUS_CANCELED;
            }
        });
    }
}
