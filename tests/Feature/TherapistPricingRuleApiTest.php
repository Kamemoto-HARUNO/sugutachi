<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Booking;
use App\Models\BookingQuote;
use App\Models\IdentityVerification;
use App\Models\ServiceAddress;
use App\Models\TherapistMenu;
use App\Models\TherapistPricingRule;
use App\Models\TherapistProfile;
use App\Models\UserProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Tests\TestCase;

class TherapistPricingRuleApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_therapist_can_manage_pricing_rules_for_profile_and_menu(): void
    {
        [$therapist, $profile, $menu] = $this->createTherapistFixture('owner');
        $token = $therapist->createToken('api')->plainTextToken;

        $firstRuleId = $this->withToken($token)
            ->postJson('/api/me/therapist/pricing-rules', [
                'rule_type' => TherapistPricingRule::RULE_TYPE_USER_PROFILE_ATTRIBUTE,
                'condition' => [
                    'field' => TherapistPricingRule::FIELD_AGE_RANGE,
                    'operator' => TherapistPricingRule::OPERATOR_EQUALS,
                    'value' => '30s',
                ],
                'adjustment_type' => TherapistPricingRule::ADJUSTMENT_TYPE_FIXED_AMOUNT,
                'adjustment_amount' => 2000,
                'priority' => 10,
            ])
            ->assertCreated()
            ->assertJsonPath('data.therapist_menu_id', null)
            ->assertJsonPath('data.condition.field', TherapistPricingRule::FIELD_AGE_RANGE)
            ->assertJsonPath('data.adjustment_amount', 2000)
            ->json('data.id');

        $secondRuleId = $this->withToken($token)
            ->postJson('/api/me/therapist/pricing-rules', [
                'therapist_menu_id' => $menu->public_id,
                'rule_type' => TherapistPricingRule::RULE_TYPE_USER_PROFILE_ATTRIBUTE,
                'condition' => [
                    'field' => TherapistPricingRule::FIELD_HEIGHT_CM,
                    'operator' => TherapistPricingRule::OPERATOR_BETWEEN,
                    'values' => [180, 190],
                ],
                'adjustment_type' => TherapistPricingRule::ADJUSTMENT_TYPE_PERCENTAGE,
                'adjustment_amount' => 10,
                'min_price_amount' => 13000,
                'priority' => 20,
            ])
            ->assertCreated()
            ->assertJsonPath('data.therapist_menu_id', $menu->public_id)
            ->assertJsonPath('data.therapist_menu.name', $menu->name)
            ->json('data.id');

        $this->withToken($token)
            ->getJson('/api/me/therapist/pricing-rules')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.id', $firstRuleId)
            ->assertJsonPath('data.1.id', $secondRuleId);

        $this->withToken($token)
            ->patchJson("/api/me/therapist/pricing-rules/{$firstRuleId}", [
                'is_active' => false,
                'max_price_amount' => 15000,
            ])
            ->assertOk()
            ->assertJsonPath('data.id', $firstRuleId)
            ->assertJsonPath('data.is_active', false)
            ->assertJsonPath('data.max_price_amount', 15000);

        $this->assertDatabaseHas('therapist_pricing_rules', [
            'id' => $firstRuleId,
            'therapist_profile_id' => $profile->id,
            'therapist_menu_id' => null,
            'is_active' => false,
            'max_price_amount' => 15000,
        ]);

        $this->withToken($token)
            ->deleteJson("/api/me/therapist/pricing-rules/{$secondRuleId}")
            ->assertNoContent();

        $this->assertDatabaseMissing('therapist_pricing_rules', [
            'id' => $secondRuleId,
        ]);

        $contextualRuleId = $this->withToken($token)
            ->postJson('/api/me/therapist/pricing-rules', [
                'rule_type' => TherapistPricingRule::RULE_TYPE_TIME_BAND,
                'condition' => [
                    'start_hour' => 22,
                    'end_hour' => 6,
                ],
                'adjustment_type' => TherapistPricingRule::ADJUSTMENT_TYPE_FIXED_AMOUNT,
                'adjustment_amount' => 800,
                'priority' => 30,
            ])
            ->assertCreated()
            ->assertJsonPath('data.rule_type', TherapistPricingRule::RULE_TYPE_TIME_BAND)
            ->assertJsonPath('data.condition.start_hour', 22)
            ->assertJsonPath('data.condition.end_hour', 6)
            ->json('data.id');

        $this->withToken($token)
            ->getJson('/api/me/therapist/pricing-rules?rule_type=time_band')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $contextualRuleId);
    }

    public function test_pricing_rule_rejects_other_profiles_menu_and_invalid_condition_operator(): void
    {
        [$therapist] = $this->createTherapistFixture('validator');
        [, , $otherMenu] = $this->createTherapistFixture('other');
        $token = $therapist->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/me/therapist/pricing-rules', [
                'therapist_menu_id' => $otherMenu->public_id,
                'rule_type' => TherapistPricingRule::RULE_TYPE_USER_PROFILE_ATTRIBUTE,
                'condition' => [
                    'field' => TherapistPricingRule::FIELD_AGE_RANGE,
                    'operator' => TherapistPricingRule::OPERATOR_EQUALS,
                    'value' => '30s',
                ],
                'adjustment_type' => TherapistPricingRule::ADJUSTMENT_TYPE_FIXED_AMOUNT,
                'adjustment_amount' => 1000,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['therapist_menu_id']);

        $this->withToken($token)
            ->postJson('/api/me/therapist/pricing-rules', [
                'rule_type' => TherapistPricingRule::RULE_TYPE_USER_PROFILE_ATTRIBUTE,
                'condition' => [
                    'field' => TherapistPricingRule::FIELD_AGE_RANGE,
                    'operator' => TherapistPricingRule::OPERATOR_GTE,
                    'value' => '30s',
                ],
                'adjustment_type' => TherapistPricingRule::ADJUSTMENT_TYPE_FIXED_AMOUNT,
                'adjustment_amount' => 1000,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['condition.operator']);

        $this->withToken($token)
            ->postJson('/api/me/therapist/pricing-rules', [
                'rule_type' => TherapistPricingRule::RULE_TYPE_DEMAND_LEVEL,
                'condition' => [
                    'operator' => TherapistPricingRule::OPERATOR_EQUALS,
                    'value' => 'holiday',
                ],
                'adjustment_type' => TherapistPricingRule::ADJUSTMENT_TYPE_FIXED_AMOUNT,
                'adjustment_amount' => 1000,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['condition.value']);
    }

    public function test_booking_quote_applies_matching_user_profile_pricing_rules(): void
    {
        [$therapist, $profile, $menu] = $this->createTherapistFixture('quote');

        $user = Account::factory()->create(['public_id' => 'acc_pricing_user']);
        UserProfile::create([
            'account_id' => $user->id,
            'profile_status' => UserProfile::STATUS_ACTIVE,
            'age_range' => '30s',
            'body_type' => 'average',
            'height_cm' => 185,
            'weight_range' => '70_79',
            'sexual_orientation' => 'gay',
            'gender_identity' => 'cis_male',
        ]);

        $serviceAddress = ServiceAddress::create([
            'public_id' => 'addr_pricing_user',
            'account_id' => $user->id,
            'label' => 'Hotel',
            'place_type' => 'hotel',
            'prefecture' => 'Tokyo',
            'city' => 'Chiyoda',
            'address_line_encrypted' => Crypt::encryptString('Tokyo Hotel'),
            'lat' => '35.6820000',
            'lng' => '139.7680000',
            'is_default' => true,
        ]);

        TherapistPricingRule::create([
            'therapist_profile_id' => $profile->id,
            'rule_type' => TherapistPricingRule::RULE_TYPE_USER_PROFILE_ATTRIBUTE,
            'condition_json' => [
                'field' => TherapistPricingRule::FIELD_AGE_RANGE,
                'operator' => TherapistPricingRule::OPERATOR_EQUALS,
                'value' => '30s',
            ],
            'adjustment_type' => TherapistPricingRule::ADJUSTMENT_TYPE_FIXED_AMOUNT,
            'adjustment_amount' => 2000,
            'priority' => 10,
            'is_active' => true,
        ]);

        TherapistPricingRule::create([
            'therapist_profile_id' => $profile->id,
            'therapist_menu_id' => $menu->id,
            'rule_type' => TherapistPricingRule::RULE_TYPE_USER_PROFILE_ATTRIBUTE,
            'condition_json' => [
                'field' => TherapistPricingRule::FIELD_HEIGHT_CM,
                'operator' => TherapistPricingRule::OPERATOR_BETWEEN,
                'values' => [180, 190],
            ],
            'adjustment_type' => TherapistPricingRule::ADJUSTMENT_TYPE_PERCENTAGE,
            'adjustment_amount' => 10,
            'priority' => 20,
            'is_active' => true,
        ]);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson('/api/booking-quotes', [
                'therapist_profile_id' => $profile->public_id,
                'therapist_menu_id' => $menu->public_id,
                'service_address_id' => $serviceAddress->public_id,
                'duration_minutes' => 60,
                'is_on_demand' => true,
            ])
            ->assertCreated()
            ->assertJsonPath('data.amounts.base_amount', 12000)
            ->assertJsonPath('data.amounts.profile_adjustment_amount', 3200)
            ->assertJsonPath('data.amounts.platform_fee_amount', 1520)
            ->assertJsonPath('data.amounts.therapist_net_amount', 13680)
            ->assertJsonPath('data.amounts.total_amount', 15500);

        $quote = BookingQuote::query()->latest('id')->firstOrFail();

        $this->assertSame(3200, $quote->profile_adjustment_amount);
        $this->assertCount(2, $quote->applied_rules_json['pricing_rules'] ?? []);
        $this->assertSame('30s', $quote->input_snapshot_json['user_profile_attributes']['age_range'] ?? null);
        $this->assertSame(185, $quote->input_snapshot_json['user_profile_attributes']['height_cm'] ?? null);
    }

    public function test_booking_quote_applies_time_walking_and_demand_pricing_rules(): void
    {
        $this->travelTo(now()->setDate(2030, 1, 5)->setTime(22, 15));

        [$therapist, $profile, $menu] = $this->createTherapistFixture('context');

        $user = Account::factory()->create(['public_id' => 'acc_pricing_context_user']);
        $serviceAddress = ServiceAddress::create([
            'public_id' => 'addr_pricing_context_user',
            'account_id' => $user->id,
            'label' => 'Hotel',
            'place_type' => 'hotel',
            'prefecture' => 'Tokyo',
            'city' => 'Shinjuku',
            'address_line_encrypted' => Crypt::encryptString('Shinjuku Hotel'),
            'lat' => '35.7000000',
            'lng' => '139.7600000',
            'is_default' => true,
        ]);

        TherapistPricingRule::create([
            'therapist_profile_id' => $profile->id,
            'rule_type' => TherapistPricingRule::RULE_TYPE_TIME_BAND,
            'condition_json' => [
                'start_hour' => 22,
                'end_hour' => 6,
            ],
            'adjustment_type' => TherapistPricingRule::ADJUSTMENT_TYPE_FIXED_AMOUNT,
            'adjustment_amount' => 500,
            'priority' => 10,
            'is_active' => true,
        ]);

        TherapistPricingRule::create([
            'therapist_profile_id' => $profile->id,
            'rule_type' => TherapistPricingRule::RULE_TYPE_WALKING_TIME_RANGE,
            'condition_json' => [
                'operator' => TherapistPricingRule::OPERATOR_EQUALS,
                'value' => TherapistPricingRule::WALKING_TIME_RANGE_WITHIN_60,
            ],
            'adjustment_type' => TherapistPricingRule::ADJUSTMENT_TYPE_FIXED_AMOUNT,
            'adjustment_amount' => 700,
            'priority' => 20,
            'is_active' => true,
        ]);

        TherapistPricingRule::create([
            'therapist_profile_id' => $profile->id,
            'rule_type' => TherapistPricingRule::RULE_TYPE_DEMAND_LEVEL,
            'condition_json' => [
                'operator' => TherapistPricingRule::OPERATOR_EQUALS,
                'value' => TherapistPricingRule::DEMAND_LEVEL_BUSY,
            ],
            'adjustment_type' => TherapistPricingRule::ADJUSTMENT_TYPE_PERCENTAGE,
            'adjustment_amount' => 10,
            'priority' => 30,
            'is_active' => true,
        ]);

        $requester = Account::factory()->create(['public_id' => 'acc_pricing_context_requester']);
        $requesterAddress = ServiceAddress::create([
            'public_id' => 'addr_pricing_context_requester',
            'account_id' => $requester->id,
            'label' => 'Hotel',
            'place_type' => 'hotel',
            'prefecture' => 'Tokyo',
            'city' => 'Shinjuku',
            'address_line_encrypted' => Crypt::encryptString('Other Hotel'),
            'lat' => '35.7000000',
            'lng' => '139.7600000',
            'is_default' => true,
        ]);

        Booking::create([
            'public_id' => 'book_pricing_context_busy',
            'user_account_id' => $requester->id,
            'therapist_account_id' => $profile->account_id,
            'therapist_profile_id' => $profile->id,
            'therapist_menu_id' => $menu->id,
            'service_address_id' => $requesterAddress->id,
            'status' => Booking::STATUS_REQUESTED,
            'is_on_demand' => true,
            'requested_start_at' => now(),
            'duration_minutes' => 60,
            'total_amount' => 12300,
            'therapist_net_amount' => 10800,
            'platform_fee_amount' => 1200,
            'matching_fee_amount' => 300,
        ]);

        $this->withToken($user->createToken('api')->plainTextToken)
            ->postJson('/api/booking-quotes', [
                'therapist_profile_id' => $profile->public_id,
                'therapist_menu_id' => $menu->public_id,
                'service_address_id' => $serviceAddress->public_id,
                'duration_minutes' => 60,
                'is_on_demand' => true,
            ])
            ->assertCreated()
            ->assertJsonPath('data.amounts.base_amount', 12000)
            ->assertJsonPath('data.amounts.travel_fee_amount', 1000)
            ->assertJsonPath('data.amounts.demand_fee_amount', 2400)
            ->assertJsonPath('data.amounts.profile_adjustment_amount', 0)
            ->assertJsonPath('data.amounts.platform_fee_amount', 1540)
            ->assertJsonPath('data.amounts.therapist_net_amount', 13860)
            ->assertJsonPath('data.amounts.total_amount', 15700)
            ->assertJsonPath('data.walking_time_range', TherapistPricingRule::WALKING_TIME_RANGE_WITHIN_60);

        $quote = BookingQuote::query()->latest('id')->firstOrFail();

        $this->assertSame(2400, $quote->demand_fee_amount);
        $this->assertSame(0, $quote->profile_adjustment_amount);
        $this->assertCount(3, $quote->applied_rules_json['pricing_rules'] ?? []);
        $this->assertSame(22, $quote->input_snapshot_json['pricing_rule_context']['requested_hour'] ?? null);
        $this->assertSame(
            TherapistPricingRule::WALKING_TIME_RANGE_WITHIN_60,
            $quote->input_snapshot_json['pricing_rule_context']['walking_time_range'] ?? null
        );
        $this->assertSame(
            TherapistPricingRule::DEMAND_LEVEL_BUSY,
            $quote->input_snapshot_json['pricing_rule_context']['demand_level'] ?? null
        );
    }

    private function createTherapistFixture(string $suffix): array
    {
        $therapist = Account::factory()->create(['public_id' => "acc_pricing_therapist_{$suffix}"]);

        IdentityVerification::create([
            'account_id' => $therapist->id,
            'status' => IdentityVerification::STATUS_APPROVED,
            'is_age_verified' => true,
            'submitted_at' => now()->subDay(),
            'reviewed_at' => now(),
        ]);

        $profile = TherapistProfile::create([
            'account_id' => $therapist->id,
            'public_id' => "thp_pricing_{$suffix}",
            'public_name' => "Pricing Therapist {$suffix}",
            'bio' => 'Relaxation focused body care.',
            'profile_status' => TherapistProfile::STATUS_APPROVED,
            'training_status' => 'completed',
            'photo_review_status' => 'approved',
            'is_online' => true,
            'online_since' => now()->subMinutes(5),
            'approved_at' => now(),
        ]);

        $menu = TherapistMenu::create([
            'public_id' => "menu_pricing_{$suffix}",
            'therapist_profile_id' => $profile->id,
            'name' => 'Body care 60',
            'duration_minutes' => 60,
            'base_price_amount' => 12000,
            'is_active' => true,
        ]);

        $profile->location()->create([
            'lat' => 35.681236,
            'lng' => 139.767125,
            'accuracy_m' => 30,
            'source' => 'test',
            'is_searchable' => true,
        ]);

        return [$therapist, $profile, $menu];
    }
}
