<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\BlogPost;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class BlogFeatureTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_create_update_and_public_can_read_blog_post(): void
    {
        Storage::fake('public');

        $admin = $this->createAdminAccount();
        $token = $admin->createToken('api')->plainTextToken;

        $imageResponse = $this->withToken($token)
            ->post('/api/admin/blog-images', [
                'image' => UploadedFile::fake()->image('body.jpg', 800, 600),
            ], [
                'Accept' => 'application/json',
            ])
            ->assertCreated();

        $bodyImageUrl = (string) $imageResponse->json('data.url');
        $this->assertStringStartsWith('/api/blog-images/', $bodyImageUrl);
        $this->get($bodyImageUrl)->assertOk();

        $createResponse = $this->withToken($token)
            ->post('/api/admin/blog-posts', [
                'title' => '安心して使うためのガイド',
                'slug' => 'safe-use-guide',
                'body_html' => '<h2 onclick="alert(1)">すぐタチとは</h2><p><strong>すぐたちとはというメッセージがここにたくさん表示されます。</strong><script>alert(1)</script></p><img src="'.$bodyImageUrl.'" alt="本文画像"><iframe src="https://www.youtube.com/embed/example"></iframe><iframe src="javascript:alert(1)"></iframe>',
                'status' => 'published',
                'published_at' => now()->subMinute()->toISOString(),
                'category_name' => '使い方',
                'category_slug' => 'guide',
                'tags' => ['安全', '予約'],
                'meta_title' => '安全ガイド',
                'meta_description' => '安心して使うためのポイントです。',
                'cover_image' => UploadedFile::fake()->image('cover.jpg', 1200, 630),
            ], [
                'Accept' => 'application/json',
            ])
            ->assertCreated()
            ->assertJsonPath('data.title', '安心して使うためのガイド')
            ->assertJsonPath('data.category.slug', 'guide')
            ->assertJsonPath('data.tags.0.name', '安全');

        $publicId = (string) $createResponse->json('data.public_id');
        $post = BlogPost::query()->where('public_id', $publicId)->firstOrFail();

        $this->assertStringNotContainsString('<script', $post->body_html);
        $this->assertStringNotContainsString('onclick', $post->body_html);
        $this->assertStringNotContainsString('javascript:', $post->body_html);
        $this->assertStringContainsString('すぐタチとは', $post->body_html);
        $this->assertStringContainsString('すぐたちとはというメッセージ', $post->body_html);
        $this->assertStringContainsString($bodyImageUrl, $post->body_html);
        $this->assertStringContainsString('youtube.com/embed/example', $post->body_html);
        Storage::disk('public')->assertExists($post->cover_image_path);

        $this->getJson('/api/blog-posts/latest')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.slug', 'safe-use-guide');

        $this->getJson('/api/blog-posts/safe-use-guide')
            ->assertOk()
            ->assertJsonPath('data.body_html', $post->body_html);

        $this->postJson("/api/blog-posts/{$post->public_id}/views", ['source' => 'search'])
            ->assertNoContent();
        $this->postJson("/api/blog-posts/{$post->public_id}/views", ['source' => 'internal'])
            ->assertNoContent();
        $this->assertDatabaseHas('blog_posts', [
            'public_id' => $post->public_id,
            'view_count' => 2,
            'search_view_count' => 1,
            'internal_view_count' => 1,
        ]);

        $this->withToken($token)
            ->post("/api/admin/blog-posts/{$publicId}", [
                '_method' => 'PATCH',
                'title' => '安心して使うための完全ガイド',
                'slug' => 'safe-use-complete-guide',
                'body_html' => '<p>更新本文</p>',
                'status' => 'published',
                'published_at' => now()->subMinute()->toISOString(),
                'category_name' => '使い方',
                'category_slug' => 'guide',
                'tags' => ['安全'],
            ], [
                'Accept' => 'application/json',
            ])
            ->assertOk()
            ->assertJsonPath('data.slug', 'safe-use-complete-guide');

        $this->assertDatabaseHas('blog_slug_redirects', [
            'old_slug' => 'safe-use-guide',
            'new_slug' => 'safe-use-complete-guide',
        ]);
        $this->get('/blog/safe-use-guide')
            ->assertRedirect('/blog/safe-use-complete-guide')
            ->assertStatus(301);
        $this->assertDatabaseHas('admin_audit_logs', [
            'actor_account_id' => $admin->id,
            'action' => 'blog.create',
        ]);
    }

    public function test_public_feed_hides_drafts_hidden_and_future_scheduled_posts(): void
    {
        $this->createPost(['slug' => 'visible', 'status' => BlogPost::STATUS_PUBLISHED, 'published_at' => now()->subHour()]);
        $this->createPost(['slug' => 'draft', 'status' => BlogPost::STATUS_DRAFT, 'published_at' => null]);
        $this->createPost(['slug' => 'hidden', 'status' => BlogPost::STATUS_HIDDEN, 'published_at' => now()->subHour()]);
        $this->createPost(['slug' => 'future', 'status' => BlogPost::STATUS_SCHEDULED, 'published_at' => now()->addHour()]);
        $this->createPost(['slug' => 'scheduled-now', 'status' => BlogPost::STATUS_SCHEDULED, 'published_at' => now()->subMinute()]);

        $this->getJson('/api/blog-posts')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.slug', 'scheduled-now')
            ->assertJsonPath('data.1.slug', 'visible');

        $this->get('/sitemap.xml')
            ->assertOk()
            ->assertSee('/blog/visible', false)
            ->assertDontSee('/blog/draft', false);

        $this->get('/robots.txt')
            ->assertOk()
            ->assertSee('/sitemap.xml', false);

        $this->getJson('/api/blog-posts/hidden')->assertNotFound();
        $this->getJson('/api/blog-posts/future')->assertNotFound();
    }

    public function test_non_admin_cannot_manage_blog_posts(): void
    {
        $user = Account::factory()->create(['public_id' => 'acc_blog_regular']);
        $token = $user->createToken('api')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/admin/blog-posts')
            ->assertForbidden();
    }

    private function createAdminAccount(): Account
    {
        $admin = Account::factory()->create(['public_id' => 'acc_blog_admin']);
        $admin->roleAssignments()->create([
            'role' => 'admin',
            'status' => 'active',
            'granted_at' => now(),
        ]);

        return $admin;
    }

    private function createPost(array $overrides = []): BlogPost
    {
        return BlogPost::create(array_merge([
            'public_id' => 'blog_'.fake()->unique()->lexify('??????'),
            'title' => 'ブログ記事',
            'slug' => 'blog-'.fake()->unique()->lexify('??????'),
            'body_html' => '<p>本文</p>',
            'excerpt' => '本文',
            'status' => BlogPost::STATUS_PUBLISHED,
            'published_at' => now()->subHour(),
        ], $overrides));
    }
}
