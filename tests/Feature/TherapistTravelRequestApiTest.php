<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\AccountBlock;
use App\Models\AppNotification;
use App\Models\IdentityVerification;
use App\Models\TherapistProfile;
use App\Models\TherapistTravelRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TherapistTravelRequestApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_send_travel_request_and_therapist_receives_notification(): void
    {
        $user = Account::factory()->create([
            'public_id' => 'acc_travel_user',
            'display_name' => 'Travel User',
        ]);
        [$therapist, $profile] = $this->createTravelRequestableTherapist();

        $requestId = $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/therapists/{$profile->public_id}/travel-requests", [
                'prefecture' => '福岡県',
                'message' => '来月に博多へ行く予定があるのでお願いしたいです。',
            ])
            ->assertCreated()
            ->assertJsonPath('data.prefecture', '福岡県')
            ->assertJsonPath('data.message', '来月に博多へ行く予定があるのでお願いしたいです。')
            ->assertJsonPath('data.status', TherapistTravelRequest::STATUS_UNREAD)
            ->assertJsonPath('data.sender.public_id', $user->public_id)
            ->json('data.public_id');

        $this->assertDatabaseHas('therapist_travel_requests', [
            'public_id' => $requestId,
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'prefecture' => '福岡県',
            'status' => TherapistTravelRequest::STATUS_UNREAD,
        ]);

        $this->assertDatabaseHas('notifications', [
            'account_id' => $therapist->id,
            'notification_type' => 'travel_request_received',
            'channel' => 'in_app',
            'status' => 'sent',
        ]);

        $notification = AppNotification::query()->where('account_id', $therapist->id)->firstOrFail();
        $this->assertSame($requestId, data_get($notification->data_json, 'travel_request_id'));
    }

    public function test_user_cannot_send_duplicate_recent_travel_request_or_contact_exchange(): void
    {
        $user = Account::factory()->create(['public_id' => 'acc_travel_dup_user']);
        [, $profile] = $this->createTravelRequestableTherapist();

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/therapists/{$profile->public_id}/travel-requests", [
                'prefecture' => '東京都',
                'message' => '東京方面でお願いしたいです。',
            ])
            ->assertCreated();

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/therapists/{$profile->public_id}/travel-requests", [
                'prefecture' => '東京都',
                'message' => 'もう一度送ります。',
            ])
            ->assertStatus(409);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/therapists/{$profile->public_id}/travel-requests", [
                'prefecture' => '福岡県',
                'message' => 'mail me at test@example.com',
            ])
            ->assertUnprocessable();
    }

    public function test_user_cannot_send_when_blocked_or_rate_limited(): void
    {
        $user = Account::factory()->create(['public_id' => 'acc_travel_blocked_user']);
        [$therapist, $profile] = $this->createTravelRequestableTherapist();

        AccountBlock::create([
            'blocker_account_id' => $therapist->id,
            'blocked_account_id' => $user->id,
            'reason_code' => 'unsafe',
        ]);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/therapists/{$profile->public_id}/travel-requests", [
                'prefecture' => '福岡県',
                'message' => 'blocked case',
            ])
            ->assertNotFound();

        AccountBlock::query()->delete();

        for ($i = 1; $i <= 5; $i++) {
            TherapistTravelRequest::create([
                'public_id' => 'trv_limit_'.$i,
                'user_account_id' => $user->id,
                'therapist_account_id' => $therapist->id,
                'therapist_profile_id' => $profile->id,
                'prefecture' => '県'.$i,
                'message_encrypted' => Crypt::encryptString('seed'),
                'status' => TherapistTravelRequest::STATUS_UNREAD,
                'created_at' => now()->subDays(2),
                'updated_at' => now()->subDays(2),
            ]);
        }

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/therapists/{$profile->public_id}/travel-requests", [
                'prefecture' => '熊本県',
                'message' => 'limit hit',
            ])
            ->assertStatus(429);
    }

    public function test_therapist_can_list_show_read_and_archive_travel_requests(): void
    {
        $sender = Account::factory()->create([
            'public_id' => 'acc_travel_sender',
            'display_name' => 'Sender Name',
        ]);
        [$therapist, $profile] = $this->createTravelRequestableTherapist();
        $otherTherapist = Account::factory()->create(['public_id' => 'acc_other_therapist']);

        $travelRequest = TherapistTravelRequest::create([
            'public_id' => 'trv_read_case',
            'user_account_id' => $sender->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $profile->id,
            'prefecture' => '福岡県',
            'message_encrypted' => Crypt::encryptString('福岡でお願いしたいです。'),
            'status' => TherapistTravelRequest::STATUS_UNREAD,
        ]);

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->getJson('/api/me/therapist/travel-requests?status=unread&q=Sender')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $travelRequest->public_id)
            ->assertJsonPath('data.0.message', '福岡でお願いしたいです。')
            ->assertJsonPath('data.0.sender.display_name', 'Sender Name');

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->getJson("/api/me/therapist/travel-requests/{$travelRequest->public_id}")
            ->assertOk()
            ->assertJsonPath('data.public_id', $travelRequest->public_id);

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->postJson("/api/me/therapist/travel-requests/{$travelRequest->public_id}/read")
            ->assertOk()
            ->assertJsonPath('data.status', TherapistTravelRequest::STATUS_READ);

        $this->withToken($therapist->createToken('api')->plainTextToken)
            ->postJson("/api/me/therapist/travel-requests/{$travelRequest->public_id}/archive")
            ->assertOk()
            ->assertJsonPath('data.status', TherapistTravelRequest::STATUS_ARCHIVED);

        $this->assertDatabaseHas('therapist_travel_requests', [
            'public_id' => $travelRequest->public_id,
            'status' => TherapistTravelRequest::STATUS_ARCHIVED,
        ]);

        Sanctum::actingAs($otherTherapist);

        $this->flushHeaders()
            ->getJson("/api/me/therapist/travel-requests/{$travelRequest->public_id}")
            ->assertNotFound();
    }

    private function createTravelRequestableTherapist(): array
    {
        $therapist = Account::factory()->create([
            'public_id' => 'acc_therapist_travel_'.fake()->unique()->numerify('###'),
            'display_name' => 'Travel Therapist',
        ]);

        IdentityVerification::create([
            'account_id' => $therapist->id,
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);

        $profile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_travel_'.fake()->unique()->numerify('###'),
            'public_name' => 'Travel Therapist Profile',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'photo_review_status' => 'approved',
        ]);

        $therapist->roleAssignments()->create([
            'role' => 'therapist',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        return [$therapist, $profile];
    }
}
