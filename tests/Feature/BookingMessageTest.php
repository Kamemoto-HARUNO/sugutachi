<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Booking;
use App\Models\BookingMessage;
use App\Models\ServiceAddress;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BookingMessageTest extends TestCase
{
    use RefreshDatabase;

    public function test_booking_participants_can_send_list_and_mark_messages_read(): void
    {
        [$user, $therapist, $booking] = $this->createMessageFixture();

        $messageId = $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/messages", [
                'body' => 'I am in the hotel lobby.',
            ])
            ->assertCreated()
            ->assertJsonPath('data.body', 'I am in the hotel lobby.')
            ->assertJsonPath('data.sender_account_id', $user->public_id)
            ->assertJsonPath('data.sender.public_id', $user->public_id)
            ->assertJsonPath('data.sender_role', 'user')
            ->assertJsonPath('data.is_own', true)
            ->assertJsonPath('data.is_read', false)
            ->json('data.id');

        $this->assertDatabaseHas('booking_messages', [
            'id' => $messageId,
            'booking_id' => $booking->id,
            'sender_account_id' => $user->id,
            'message_type' => 'text',
            'moderation_status' => 'ok',
        ]);

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->getJson("/api/bookings/{$booking->public_id}/messages")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $messageId)
            ->assertJsonPath('data.0.body', 'I am in the hotel lobby.')
            ->assertJsonPath('data.0.sender.public_id', $user->public_id)
            ->assertJsonPath('data.0.sender_role', 'user')
            ->assertJsonPath('data.0.is_own', false)
            ->assertJsonPath('data.0.is_read', false)
            ->assertJsonPath('meta.booking_public_id', $booking->public_id)
            ->assertJsonPath('meta.booking_status', Booking::STATUS_ACCEPTED)
            ->assertJsonPath('meta.unread_count', 1)
            ->assertJsonPath('meta.counterparty.public_id', $user->public_id)
            ->assertJsonPath('meta.counterparty.role', 'user');

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/messages/{$messageId}/read")
            ->assertOk()
            ->assertJsonPath('data.is_read', true);

        $this->assertNotNull(BookingMessage::query()->findOrFail($messageId)->read_at);

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->getJson("/api/bookings/{$booking->public_id}/messages?read_status=unread")
            ->assertOk()
            ->assertJsonCount(0, 'data')
            ->assertJsonPath('meta.unread_count', 0)
            ->assertJsonPath('meta.filters.read_status', 'unread');
    }

    public function test_counterparty_typing_indicator_is_visible_and_cleared_after_send(): void
    {
        [$user, $therapist, $booking] = $this->createMessageFixture();

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/messages/typing", [
                'is_typing' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.booking_public_id', $booking->public_id)
            ->assertJsonPath('data.is_typing', true);

        $typingResponse = $this->withToken($therapist->createToken('api')->plainTextToken)
            ->getJson("/api/bookings/{$booking->public_id}/messages")
            ->assertOk()
            ->assertJsonPath('meta.counterparty_typing', true);

        $this->assertNotNull($typingResponse->json('meta.counterparty_typing_updated_at'));

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/messages", [
                'body' => 'そろそろ到着します。',
            ])
            ->assertCreated();

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->getJson("/api/bookings/{$booking->public_id}/messages")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.counterparty_typing', false)
            ->assertJsonPath('data.0.body', 'そろそろ到着します。');
    }

    public function test_message_rejects_contact_exchange(): void
    {
        [$user, , $booking] = $this->createMessageFixture();

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/messages", [
                'body' => 'mail me at test@example.com',
            ])
            ->assertUnprocessable();

        $this->assertDatabaseCount('booking_messages', 0);
    }

    public function test_non_participant_cannot_read_booking_messages(): void
    {
        [, , $booking] = $this->createMessageFixture();
        $other = Account::factory()->create(['public_id' => 'acc_other_message']);

        $this->withToken($other->createToken('api')->plainTextToken)
            ->getJson("/api/bookings/{$booking->public_id}/messages")
            ->assertNotFound();
    }

    private function createMessageFixture(): array
    {
        $user = Account::factory()->create(['public_id' => 'acc_user_message']);
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_message']);

        $therapistProfile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_message',
            'public_name' => 'Message Therapist',
            'profile_status' => 'approved',
        ]);

        $menu = TherapistMenu::create([
            'public_id' => 'menu_message_60',
            'therapist_profile_id' => $therapistProfile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
        ]);

        $address = ServiceAddress::create([
            'public_id' => 'addr_message',
            'account_id' => $user->id,
            'place_type' => 'hotel',
            'address_line_encrypted' => 'encrypted-address',
            'lat' => '35.6812360',
            'lng' => '139.7671250',
        ]);

        $booking = Booking::create([
            'public_id' => 'book_message',
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $address->id,
            'status' => Booking::STATUS_ACCEPTED,
            'duration_minutes' => 60,
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);

        return [$user, $therapist, $booking];
    }
}
