<?php

namespace Tests\Feature;

use Tests\TestCase;

class OgpMetaTest extends TestCase
{
    public function test_app_shell_renders_x_card_title_meta_tags(): void
    {
        config()->set('app.name', '');
        config()->set('service_meta.name', '');
        config()->set('app.url', 'https://sugutachi.com');

        $response = $this->get('/');

        $response
            ->assertOk()
            ->assertSee('<meta property="og:title" content="すぐタチ - リラクゼーション / ボディケア / もみほぐしの予約・マッチングサービス">', false)
            ->assertSee('<meta name="twitter:title" content="すぐタチ - リラクゼーション / ボディケア / もみほぐしの予約・マッチングサービス">', false)
            ->assertSee('<meta property="og:description" content="リラクゼーション / ボディケア / もみほぐしの予約・マッチングサービス">', false)
            ->assertSee('<meta name="twitter:description" content="リラクゼーション / ボディケア / もみほぐしの予約・マッチングサービス">', false)
            ->assertDontSee('twitter:text:title', false);
    }
}
