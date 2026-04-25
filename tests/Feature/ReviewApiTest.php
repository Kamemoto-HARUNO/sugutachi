<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Booking;
use App\Models\IdentityVerification;
use App\Models\Review;
use App\Models\ServiceAddress;
use App\Models\TherapistMenu;
use App\Models\TherapistProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReviewApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_review_completed_booking_and_updates_therapist_rating(): void
    {
        [$user, $therapist, $booking, $therapistProfile] = $this->createReviewFixture(Booking::STATUS_COMPLETED);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/reviews", [
                'rating_overall' => 5,
                'rating_manners' => 5,
                'rating_skill' => 4,
                'rating_cleanliness' => 5,
                'rating_safety' => 5,
                'public_comment' => 'Calm and respectful.',
                'private_feedback' => 'No issue.',
            ])
            ->assertCreated()
            ->assertJsonPath('data.booking_public_id', $booking->public_id)
            ->assertJsonPath('data.reviewer_account_id', $user->public_id)
            ->assertJsonPath('data.reviewee_account_id', $therapist->public_id)
            ->assertJsonPath('data.reviewer_role', 'user')
            ->assertJsonPath('data.rating_overall', 5)
            ->assertJsonPath('data.public_comment', 'Calm and respectful.');

        $therapistProfile->refresh();

        $this->assertSame(1, $therapistProfile->review_count);
        $this->assertSame('5.00', (string) $therapistProfile->rating_average);
        $this->assertDatabaseHas('reviews', [
            'booking_id' => $booking->id,
            'reviewer_account_id' => $user->id,
            'reviewee_account_id' => $therapist->id,
            'reviewer_role' => 'user',
            'status' => Review::STATUS_VISIBLE,
        ]);
    }

    public function test_therapist_public_reviews_include_only_visible_user_reviews(): void
    {
        [$user, $therapist, $booking, $therapistProfile] = $this->createReviewFixture(Booking::STATUS_COMPLETED);

        Review::create([
            'booking_id' => $booking->id,
            'reviewer_account_id' => $user->id,
            'reviewee_account_id' => $therapist->id,
            'reviewer_role' => 'user',
            'rating_overall' => 5,
            'public_comment' => 'Visible comment.',
            'status' => Review::STATUS_VISIBLE,
        ]);
        Review::create([
            'booking_id' => $booking->id,
            'reviewer_account_id' => $therapist->id,
            'reviewee_account_id' => $user->id,
            'reviewer_role' => 'therapist',
            'rating_overall' => 4,
            'public_comment' => 'Not public on therapist profile.',
            'status' => Review::STATUS_VISIBLE,
        ]);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->getJson("/api/therapists/{$therapistProfile->public_id}/reviews")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_comment', 'Visible comment.');
    }

    public function test_review_requires_reviewable_status(): void
    {
        [$user, , $booking] = $this->createReviewFixture(Booking::STATUS_ACCEPTED);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/reviews", [
                'rating_overall' => 5,
            ])
            ->assertConflict();
    }

    public function test_non_participant_cannot_review_booking(): void
    {
        [, , $booking] = $this->createReviewFixture(Booking::STATUS_COMPLETED);
        $other = Account::factory()->create(['public_id' => 'acc_review_other']);

        $this->withToken($other->createToken('api')->plainTextToken)
            ->postJson("/api/bookings/{$booking->public_id}/reviews", [
                'rating_overall' => 5,
            ])
            ->assertNotFound();
    }

    public function test_reviewer_can_review_booking_only_once(): void
    {
        [$user, , $booking] = $this->createReviewFixture(Booking::STATUS_COMPLETED);

        $token = $user->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->postJson("/api/bookings/{$booking->public_id}/reviews", [
                'rating_overall' => 5,
            ])
            ->assertCreated();

        $this->withToken($token)
            ->postJson("/api/bookings/{$booking->public_id}/reviews", [
                'rating_overall' => 4,
            ])
            ->assertConflict();
    }

    private function createReviewFixture(string $status): array
    {
        $user = Account::factory()->create(['public_id' => 'acc_user_review']);
        $therapist = Account::factory()->create(['public_id' => 'acc_therapist_review']);

        $therapistProfile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => 'thp_review',
            'public_name' => 'Review Therapist',
            'profile_status' => 'approved',
        ]);
        IdentityVerification::create([
            'account_id' => $therapist->id,
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);

        $menu = TherapistMenu::create([
            'public_id' => 'menu_review_60',
            'therapist_profile_id' => $therapistProfile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
        ]);

        $address = ServiceAddress::create([
            'public_id' => 'addr_review',
            'account_id' => $user->id,
            'place_type' => 'hotel',
            'address_line_encrypted' => 'encrypted-address',
            'lat' => '35.6812360',
            'lng' => '139.7671250',
        ]);

        $booking = Booking::create([
            'public_id' => 'book_review',
            'user_account_id' => $user->id,
            'therapist_account_id' => $therapist->id,
            'therapist_profile_id' => $therapistProfile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $address->id,
            'status' => $status,
            'duration_minutes' => 60,
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);

        return [$user, $therapist, $booking, $therapistProfile];
    }
}
