<?php

namespace Tests\Feature;

use App\Contracts\Payments\CreatedPaymentIntent;
use App\Contracts\Payments\PaymentIntentGateway;
use App\Models\Account;
use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\BookingQuote;
use App\Models\IdentityVerification;
use App\Models\PaymentIntent;
use App\Models\ServiceAddress;
use App\Models\StripeConnectedAccount;
use App\Models\TherapistBookingSetting;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BookingRequestExpirationCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_command_expires_due_scheduled_requests_and_cancels_current_payment_intent(): void
    {
        $this->travelTo(CarbonImmutable::parse('2030-01-05 12:00:00'));

        $this->app->bind(PaymentIntentGateway::class, fn () => new class implements PaymentIntentGateway
        {
            public array $canceled = [];

            public function create(
                Booking $booking,
                BookingQuote $quote,
                ?StripeConnectedAccount $connectedAccount = null
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
                $this->canceled[] = $paymentIntent->stripe_payment_intent_id;

                return PaymentIntent::STRIPE_STATUS_CANCELED;
            }
        });

        [$requestedBooking, $requestedPaymentIntent] = $this->createScheduledBooking(
            publicId: 'book_expire_requested',
            status: Booking::STATUS_REQUESTED,
            requestExpiresAt: CarbonImmutable::parse('2030-01-05 11:55:00'),
            withPaymentIntent: true,
        );

        [$authorizingBooking] = $this->createScheduledBooking(
            publicId: 'book_expire_authorizing',
            status: Booking::STATUS_PAYMENT_AUTHORIZING,
            requestExpiresAt: CarbonImmutable::parse('2030-01-05 11:50:00'),
            withPaymentIntent: false,
        );

        [$futureBooking] = $this->createScheduledBooking(
            publicId: 'book_future_request',
            status: Booking::STATUS_REQUESTED,
            requestExpiresAt: CarbonImmutable::parse('2030-01-05 12:30:00'),
            withPaymentIntent: true,
        );

        [$onDemandBooking] = $this->createScheduledBooking(
            publicId: 'book_ondemand_request',
            status: Booking::STATUS_REQUESTED,
            requestExpiresAt: CarbonImmutable::parse('2030-01-05 11:45:00'),
            isOnDemand: true,
            withPaymentIntent: true,
        );

        $this->artisan('bookings:expire-pending-requests')
            ->expectsOutput('Expired 2 scheduled booking requests. failed=0')
            ->assertExitCode(0);

        $this->assertDatabaseHas('bookings', [
            'id' => $requestedBooking->id,
            'status' => Booking::STATUS_EXPIRED,
        ]);
        $this->assertDatabaseHas('bookings', [
            'id' => $authorizingBooking->id,
            'status' => Booking::STATUS_EXPIRED,
        ]);
        $this->assertDatabaseHas('payment_intents', [
            'id' => $requestedPaymentIntent->id,
            'status' => PaymentIntent::STRIPE_STATUS_CANCELED,
        ]);
        $this->assertDatabaseHas('booking_status_logs', [
            'booking_id' => $requestedBooking->id,
            'from_status' => Booking::STATUS_REQUESTED,
            'to_status' => Booking::STATUS_EXPIRED,
            'actor_role' => 'system',
            'reason_code' => 'request_expired',
        ]);
        $this->assertDatabaseHas('booking_status_logs', [
            'booking_id' => $authorizingBooking->id,
            'from_status' => Booking::STATUS_PAYMENT_AUTHORIZING,
            'to_status' => Booking::STATUS_EXPIRED,
            'actor_role' => 'system',
            'reason_code' => 'request_expired',
        ]);
        $this->assertDatabaseHas('notifications', [
            'account_id' => $requestedBooking->user_account_id,
            'notification_type' => 'booking_canceled',
            'channel' => 'in_app',
            'status' => 'sent',
        ]);

        $notification = AppNotification::query()
            ->where('account_id', $requestedBooking->user_account_id)
            ->where('notification_type', 'booking_canceled')
            ->firstOrFail();

        $this->assertSame($requestedBooking->public_id, data_get($notification->data_json, 'booking_public_id'));
        $this->assertSame('request_expired', data_get($notification->data_json, 'reason_code'));
        $this->assertSame('system', data_get($notification->data_json, 'canceled_by_role'));

        $this->assertDatabaseHas('bookings', [
            'id' => $futureBooking->id,
            'status' => Booking::STATUS_REQUESTED,
        ]);
        $this->assertDatabaseHas('bookings', [
            'id' => $onDemandBooking->id,
            'status' => Booking::STATUS_REQUESTED,
        ]);
    }

    private function createScheduledBooking(
        string $publicId,
        string $status,
        CarbonImmutable $requestExpiresAt,
        bool $isOnDemand = false,
        bool $withPaymentIntent = true,
    ): array {
        $user = Account::factory()->create(['public_id' => 'acc_expire_user_'.fake()->unique()->numerify('###')]);
        $therapist = Account::factory()->create(['public_id' => 'acc_expire_therapist_'.fake()->unique()->numerify('###')]);

        IdentityVerification::create([
            'account_id' => $therapist->id,
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);

        $profile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_expire_'.fake()->unique()->numerify('###'),
            'public_name' => 'Expire Therapist',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'photo_review_status' => 'approved',
        ]);

        TherapistBookingSetting::create([
            'therapist_profile_id' => $profile->id,
            'booking_request_lead_time_minutes' => 60,
            'scheduled_base_label' => 'Tenjin Base',
            'scheduled_base_lat' => '33.5907000',
            'scheduled_base_lng' => '130.4020000',
        ]);

        $menu = TherapistMenu::create([
            'public_id' => 'menu_expire_'.fake()->unique()->numerify('###'),
            'therapist_profile_id' => $profile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
        ]);

        $address = ServiceAddress::create([
            'public_id' => 'addr_expire_'.fake()->unique()->numerify('###'),
            'account_id' => $user->id,
            'place_type' => 'hotel',
            'address_line_encrypted' => 'encrypted-address',
            'lat' => '35.6812360',
            'lng' => '139.7671250',
        ]);

        $booking = Booking::create([
            'public_id' => $publicId,
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $profile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $address->id,
            'status' => $status,
            'is_on_demand' => $isOnDemand,
            'requested_start_at' => CarbonImmutable::parse('2030-01-05 14:00:00'),
            'scheduled_start_at' => CarbonImmutable::parse('2030-01-05 14:00:00'),
            'scheduled_end_at' => CarbonImmutable::parse('2030-01-05 15:00:00'),
            'duration_minutes' => 60,
            'buffer_before_minutes' => 0,
            'buffer_after_minutes' => 0,
            'request_expires_at' => $requestExpiresAt,
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);

        $paymentIntent = $withPaymentIntent
            ? PaymentIntent::create([
                'booking_id' => $booking->id,
                'payer_account_id' => $user->id,
                'stripe_payment_intent_id' => 'pi_'.$publicId,
                'status' => PaymentIntent::STRIPE_STATUS_REQUIRES_CAPTURE,
                'capture_method' => 'manual',
                'currency' => 'jpy',
                'amount' => 12300,
                'application_fee_amount' => 1500,
                'transfer_amount' => 10800,
                'is_current' => true,
                'authorized_at' => now()->subHour(),
            ])
            : null;

        return [$booking, $paymentIntent];
    }
}
