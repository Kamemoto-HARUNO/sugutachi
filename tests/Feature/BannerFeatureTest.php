<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Banner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BannerFeatureTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_create_update_list_and_delete_banner(): void
    {
        Storage::fake('public');

        $admin = $this->createAdminAccount();
        $token = $admin->createToken('api')->plainTextToken;

        $createResponse = $this->withToken($token)
            ->post('/api/admin/banners', [
                'title' => '公開トップ告知',
                'link_url' => 'https://example.test/campaigns/spring',
                'placements' => ['home', 'dashboard'],
                'viewer_segments' => ['guest', 'user'],
                'status' => 'published',
                'sort_order' => 5,
                'starts_at' => now()->subHour()->toISOString(),
                'ends_at' => now()->addDays(7)->toISOString(),
                'image' => UploadedFile::fake()->image('banner-home.jpg', 1600, 900),
            ], [
                'Accept' => 'application/json',
            ])
            ->assertCreated()
            ->assertJsonPath('data.title', '公開トップ告知')
            ->assertJsonPath('data.placements.0', 'home')
            ->assertJsonPath('data.viewer_segments.1', 'user');

        $bannerPublicId = (string) $createResponse->json('data.public_id');
        $this->assertSame("/api/banners/{$bannerPublicId}/image", $createResponse->json('data.image_url'));
        $banner = Banner::query()->where('public_id', $bannerPublicId)->firstOrFail();
        $originalImagePath = $banner->image_path;

        Storage::disk('public')->assertExists($originalImagePath);
        $this->get("/api/banners/{$bannerPublicId}/image")->assertOk();

        $this->withToken($token)
            ->getJson('/api/admin/banners?placement=home&viewer_segment=guest&status=published')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $bannerPublicId);

        $this->withToken($token)
            ->post("/api/admin/banners/{$bannerPublicId}", [
                '_method' => 'PATCH',
                'title' => 'ダッシュボード向け告知',
                'link_url' => 'https://example.test/campaigns/dashboard',
                'placements' => ['dashboard'],
                'viewer_segments' => ['therapist'],
                'status' => 'hidden',
                'sort_order' => 20,
                'starts_at' => now()->subHours(2)->toISOString(),
                'ends_at' => '',
                'image' => UploadedFile::fake()->image('banner-dashboard.png', 1280, 720),
            ], [
                'Accept' => 'application/json',
            ])
            ->assertOk()
            ->assertJsonPath('data.title', 'ダッシュボード向け告知')
            ->assertJsonPath('data.status', 'hidden')
            ->assertJsonPath('data.viewer_segments.0', 'therapist');

        $updatedBanner = $banner->fresh();

        $this->assertNotSame($originalImagePath, $updatedBanner->image_path);
        Storage::disk('public')->assertMissing($originalImagePath);
        Storage::disk('public')->assertExists($updatedBanner->image_path);

        $this->withToken($token)
            ->deleteJson("/api/admin/banners/{$bannerPublicId}")
            ->assertNoContent();

        $this->assertDatabaseMissing('banners', [
            'public_id' => $bannerPublicId,
        ]);
        Storage::disk('public')->assertMissing($updatedBanner->image_path);

        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'banner.create',
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'banner.update',
        ]);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'banner.delete',
        ]);
    }

    public function test_public_and_authenticated_banner_feeds_filter_by_placement_and_role_segments(): void
    {
        $guestBanner = $this->createBanner([
            'public_id' => 'bnr_guest_home',
            'title' => 'ゲスト向けホーム',
            'placements' => ['home'],
            'viewer_segments' => ['guest'],
        ]);
        $userBanner = $this->createBanner([
            'public_id' => 'bnr_user_home',
            'title' => '利用者向けホーム',
            'placements' => ['home'],
            'viewer_segments' => ['user'],
            'sort_order' => 10,
        ]);
        $therapistBanner = $this->createBanner([
            'public_id' => 'bnr_therapist_dashboard',
            'title' => 'タチキャスト向けダッシュボード',
            'placements' => ['dashboard'],
            'viewer_segments' => ['therapist'],
        ]);
        $sharedDetailBanner = $this->createBanner([
            'public_id' => 'bnr_shared_detail',
            'title' => '詳細共通バナー',
            'placements' => ['therapist_detail'],
            'viewer_segments' => ['user', 'therapist'],
        ]);
        $this->createBanner([
            'public_id' => 'bnr_hidden_guest',
            'title' => '非公開ゲスト',
            'placements' => ['home'],
            'viewer_segments' => ['guest'],
            'status' => Banner::STATUS_HIDDEN,
        ]);
        $this->createBanner([
            'public_id' => 'bnr_future_guest',
            'title' => '開始待ちゲスト',
            'placements' => ['home'],
            'viewer_segments' => ['guest'],
            'starts_at' => now()->addDay(),
        ]);

        $user = Account::factory()->create(['public_id' => 'acc_banner_user']);
        $user->roleAssignments()->create([
            'role' => 'user',
            'status' => 'active',
            'granted_at' => now(),
        ]);
        $therapist = Account::factory()->create(['public_id' => 'acc_banner_therapist']);
        $therapist->roleAssignments()->create([
            'role' => 'therapist',
            'status' => 'active',
            'granted_at' => now(),
        ]);
        $hybrid = Account::factory()->create(['public_id' => 'acc_banner_hybrid']);
        $hybrid->roleAssignments()->create([
            'role' => 'user',
            'status' => 'active',
            'granted_at' => now(),
        ]);
        $hybrid->roleAssignments()->create([
            'role' => 'therapist',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        $this->getJson('/api/banners?placement=home')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $guestBanner->public_id);

        Sanctum::actingAs($user);
        $this
            ->getJson('/api/me/banners?placement=home')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $userBanner->public_id);

        Sanctum::actingAs($therapist);
        $this
            ->getJson('/api/me/banners?placement=dashboard')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $therapistBanner->public_id);

        Sanctum::actingAs($hybrid);
        $this
            ->getJson('/api/me/banners?placement=therapist_detail')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.public_id', $sharedDetailBanner->public_id);
    }

    public function test_banner_impressions_and_clicks_increment_only_for_visible_banners(): void
    {
        $visibleBanner = $this->createBanner([
            'public_id' => 'bnr_visible_metrics',
            'placements' => ['home'],
            'viewer_segments' => ['guest'],
        ]);
        $hiddenBanner = $this->createBanner([
            'public_id' => 'bnr_hidden_metrics',
            'placements' => ['home'],
            'viewer_segments' => ['guest'],
            'status' => Banner::STATUS_HIDDEN,
        ]);

        $this->postJson("/api/banners/{$visibleBanner->public_id}/impressions")
            ->assertNoContent();
        $this->postJson("/api/banners/{$visibleBanner->public_id}/clicks")
            ->assertNoContent();
        $this->postJson("/api/banners/{$hiddenBanner->public_id}/impressions")
            ->assertNoContent();
        $this->postJson("/api/banners/{$hiddenBanner->public_id}/clicks")
            ->assertNoContent();

        $this->assertDatabaseHas('banners', [
            'public_id' => $visibleBanner->public_id,
            'impression_count' => 1,
            'click_count' => 1,
        ]);
        $this->assertDatabaseHas('banners', [
            'public_id' => $hiddenBanner->public_id,
            'impression_count' => 0,
            'click_count' => 0,
        ]);
    }

    public function test_non_admin_cannot_manage_banners(): void
    {
        $user = Account::factory()->create(['public_id' => 'acc_banner_regular']);
        $token = $user->createToken('api')->plainTextToken;
        $banner = $this->createBanner([
            'public_id' => 'bnr_admin_guard',
            'placements' => ['home'],
            'viewer_segments' => ['guest'],
        ]);

        $this->withToken($token)
            ->getJson('/api/admin/banners')
            ->assertForbidden();

        $this->withToken($token)
            ->postJson('/api/admin/banners', [
                'title' => '権限なし',
                'link_url' => 'https://example.test/nope',
                'placements' => ['home'],
                'viewer_segments' => ['guest'],
                'status' => 'draft',
                'sort_order' => 1,
                'starts_at' => now()->toISOString(),
            ])
            ->assertForbidden();

        $this->withToken($token)
            ->deleteJson("/api/admin/banners/{$banner->public_id}")
            ->assertForbidden();
    }

    private function createAdminAccount(): Account
    {
        $admin = Account::factory()->create(['public_id' => 'acc_banner_admin']);
        $admin->roleAssignments()->create([
            'role' => 'admin',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        return $admin;
    }

    private function createBanner(array $overrides = []): Banner
    {
        return Banner::create(array_merge([
            'public_id' => 'bnr_'.fake()->unique()->lexify('??????'),
            'title' => 'バナー',
            'link_url' => 'https://example.test/banner',
            'image_path' => 'banners/test/banner.jpg',
            'image_original_name' => 'banner.jpg',
            'image_mime_type' => 'image/jpeg',
            'image_size_bytes' => 1024,
            'placements' => ['home'],
            'viewer_segments' => ['guest'],
            'status' => Banner::STATUS_PUBLISHED,
            'sort_order' => 1,
            'starts_at' => now()->subHour(),
            'ends_at' => now()->addDay(),
            'impression_count' => 0,
            'click_count' => 0,
        ], $overrides));
    }
}
