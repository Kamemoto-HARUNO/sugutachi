<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\BookingMessage;
use App\Models\ServiceAddress;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
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

    public function test_sending_message_notifies_the_counterparty_for_both_roles(): void
    {
        Mail::shouldReceive('raw')->twice();

        [$user, $therapist, $booking] = $this->createMessageFixture();

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/messages", [
                'body' => '利用者からのメッセージです。',
            ])
            ->assertCreated();

        $therapistNotification = AppNotification::query()
            ->where('account_id', $therapist->id)
            ->where('notification_type', 'booking_message_received')
            ->latest('id')
            ->firstOrFail();

        $this->assertSame('新しいメッセージが届きました', $therapistNotification->title);
        $this->assertSame('利用者からメッセージが届きました。', $therapistNotification->body);
        $this->assertSame("/therapist/bookings/{$booking->public_id}/messages", $therapistNotification->data_json['target_path'] ?? null);
        $this->assertSame('user', $therapistNotification->data_json['sender_role'] ?? null);

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/messages", [
                'body' => 'タチキャストからの返信です。',
            ])
            ->assertCreated();

        $userNotification = AppNotification::query()
            ->where('account_id', $user->id)
            ->where('notification_type', 'booking_message_received')
            ->latest('id')
            ->firstOrFail();

        $this->assertSame('新しいメッセージが届きました', $userNotification->title);
        $this->assertSame('タチキャストからメッセージが届きました。', $userNotification->body);
        $this->assertSame("/user/bookings/{$booking->public_id}/messages", $userNotification->data_json['target_path'] ?? null);
        $this->assertSame('therapist', $userNotification->data_json['sender_role'] ?? null);
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

    public function test_booking_participants_can_send_image_messages_and_open_signed_file(): void
    {
        Storage::fake('local');

        [$user, $therapist, $booking] = $this->createMessageFixture();

        $response = $this->withToken($user->createToken('api')->plainTextToken)
            ->withHeaders(['Accept' => 'application/json'])
            ->post("/api/bookings/{$booking->public_id}/messages", [
                'image' => UploadedFile::fake()->image('arrival-note.png', 1200, 900),
            ])
            ->assertCreated()
            ->assertJsonPath('data.message_type', BookingMessage::TYPE_IMAGE)
            ->assertJsonPath('data.body', '');

        $messageId = $response->json('data.id');
        $attachmentUrl = $response->json('data.attachment_url');

        $this->assertNotNull($attachmentUrl);
        $this->assertDatabaseHas('booking_messages', [
            'id' => $messageId,
            'booking_id' => $booking->id,
            'sender_account_id' => $user->id,
            'message_type' => BookingMessage::TYPE_IMAGE,
            'moderation_status' => BookingMessage::MODERATION_STATUS_OK,
        ]);

        $attachmentPath = parse_url($attachmentUrl, PHP_URL_PATH);
        $attachmentQuery = parse_url($attachmentUrl, PHP_URL_QUERY);

        $this->assertNotFalse($attachmentPath);

        $this->get($attachmentQuery ? $attachmentPath.'?'.$attachmentQuery : $attachmentPath)
            ->assertOk()
            ->assertHeader('cache-control', 'max-age=300, private');

        $therapistMessages = $this->withToken($therapist->createToken('api')->plainTextToken)
            ->getJson("/api/bookings/{$booking->public_id}/messages")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.message_type', BookingMessage::TYPE_IMAGE)
            ->assertJsonPath('data.0.attachment_original_name', 'arrival-note.png');

        $this->assertNotNull($therapistMessages->json('data.0.attachment_url'));
    }

    public function test_image_message_sender_can_delete_uploaded_image_and_counterparty_sees_placeholder(): void
    {
        Storage::fake('local');

        [$user, $therapist, $booking] = $this->createMessageFixture();

        $response = $this->withToken($user->createToken('api')->plainTextToken)
            ->withHeaders(['Accept' => 'application/json'])
            ->post("/api/bookings/{$booking->public_id}/messages", [
                'image' => UploadedFile::fake()->image('meeting-place.png', 1000, 700),
            ])
            ->assertCreated();

        $messageId = $response->json('data.id');
        $attachmentUrl = $response->json('data.attachment_url');
        $attachmentPath = parse_url($attachmentUrl, PHP_URL_PATH);
        $attachmentQuery = parse_url($attachmentUrl, PHP_URL_QUERY);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->deleteJson("/api/bookings/{$booking->public_id}/messages/{$messageId}/image")
            ->assertOk()
            ->assertJsonPath('data.message_type', BookingMessage::TYPE_IMAGE)
            ->assertJsonPath('data.is_deleted', true)
            ->assertJsonPath('data.can_delete_image', false)
            ->assertJsonPath('data.attachment_url', null);

        $this->assertDatabaseHas('booking_messages', [
            'id' => $messageId,
            'attachment_storage_key_encrypted' => null,
            'attachment_original_name' => null,
            'attachment_mime_type' => null,
            'attachment_size_bytes' => null,
        ]);

        $this->get($attachmentQuery ? $attachmentPath.'?'.$attachmentQuery : $attachmentPath)
            ->assertNotFound();

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->getJson("/api/bookings/{$booking->public_id}/messages")
            ->assertOk()
            ->assertJsonPath('data.0.is_deleted', true)
            ->assertJsonPath('data.0.attachment_url', null);
    }

    public function test_only_image_message_sender_can_delete_the_uploaded_image(): void
    {
        Storage::fake('local');

        [$user, $therapist, $booking] = $this->createMessageFixture();

        $response = $this->withToken($user->createToken('api')->plainTextToken)
            ->withHeaders(['Accept' => 'application/json'])
            ->post("/api/bookings/{$booking->public_id}/messages", [
                'image' => UploadedFile::fake()->image('private-route.png', 640, 480),
            ])
            ->assertCreated();

        $messageId = $response->json('data.id');

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->deleteJson("/api/bookings/{$booking->public_id}/messages/{$messageId}/image")
            ->assertForbidden();

        $this->assertDatabaseMissing('booking_messages', [
            'id' => $messageId,
            'attachment_storage_key_encrypted' => null,
        ]);
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
