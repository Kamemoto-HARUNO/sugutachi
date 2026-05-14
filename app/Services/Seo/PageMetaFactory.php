<?php

namespace App\Services\Seo;

use App\Models\BlogPost;
use Illuminate\Support\Str;

class PageMetaFactory
{
    public function default(): array
    {
        $serviceName = $this->serviceName();
        $description = 'リラクゼーション / ボディケア / もみほぐしの予約・マッチングサービス';
        $title = $serviceName.' - '.$description;

        return [
            'title' => $title,
            'description' => $description,
            'canonical_url' => url()->current(),
            'og_title' => $title,
            'og_description' => $description,
            'og_type' => 'website',
            'og_image_url' => asset('images/ogp/default.jpg'),
            'robots' => null,
            'json_ld' => [
                '@context' => 'https://schema.org',
                '@type' => 'WebSite',
                'name' => $serviceName,
                'url' => rtrim((string) config('app.url'), '/').'/',
            ],
        ];
    }

    public function gayMassageIndex(): array
    {
        return $this->merge([
            'title' => 'ゲイマッサージ・男性向け出張マッサージを探す | '.$this->serviceName(),
            'description' => '対応エリアからゲイマッサージを探せます。公開中のタチキャストがいる地域だけを掲載し、写真、口コミ、プロフィールを確認できます。',
            'canonical_url' => $this->absoluteUrl('/gay-massage'),
            'og_title' => 'ゲイマッサージ・男性向け出張マッサージを探す',
            'og_description' => '対応エリアからゲイマッサージを探せます。公開中のタチキャストがいる地域だけを掲載しています。',
            'json_ld' => [
                '@context' => 'https://schema.org',
                '@type' => 'CollectionPage',
                'name' => 'ゲイマッサージ・男性向け出張マッサージを探す',
                'description' => '対応エリアからゲイマッサージを探せます。',
                'url' => $this->absoluteUrl('/gay-massage'),
                'isPartOf' => [
                    '@type' => 'WebSite',
                    'name' => $this->serviceName(),
                    'url' => rtrim((string) config('app.url'), '/').'/',
                ],
            ],
        ]);
    }

    public function gayMassageArea(array $area): array
    {
        $name = (string) $area['name'];
        $pageName = "{$name}のゲイマッサージ・男性向け出張マッサージ";
        $description = "{$name}で公開中のタチキャストを、写真・口コミ・プロフィールから確認できます。正確な拠点情報は公開せず、予約時も安心して比較できる情報に絞って掲載しています。";
        $url = $this->absoluteUrl('/gay-massage/'.$area['slug']);

        return $this->merge([
            'title' => $pageName.' | '.$this->serviceName(),
            'description' => $description,
            'canonical_url' => $url,
            'og_title' => $pageName,
            'og_description' => $description,
            'json_ld' => [
                '@context' => 'https://schema.org',
                '@graph' => [
                    [
                        '@type' => 'CollectionPage',
                        'name' => $pageName,
                        'description' => $description,
                        'url' => $url,
                        'isPartOf' => [
                            '@type' => 'WebSite',
                            'name' => $this->serviceName(),
                            'url' => rtrim((string) config('app.url'), '/').'/',
                        ],
                    ],
                    [
                        '@type' => 'BreadcrumbList',
                        'itemListElement' => [
                            [
                                '@type' => 'ListItem',
                                'position' => 1,
                                'name' => 'ホーム',
                                'item' => $this->absoluteUrl('/'),
                            ],
                            [
                                '@type' => 'ListItem',
                                'position' => 2,
                                'name' => 'ゲイマッサージ',
                                'item' => $this->absoluteUrl('/gay-massage'),
                            ],
                            [
                                '@type' => 'ListItem',
                                'position' => 3,
                                'name' => $name,
                                'item' => $url,
                            ],
                        ],
                    ],
                ],
            ],
        ]);
    }

    public function blogIndex(): array
    {
        return $this->merge([
            'title' => 'すぐタチブログ | '.$this->serviceName(),
            'description' => 'すぐタチの使い方、安全に利用するためのポイント、男性向けリラクゼーションの予約前に確認したい情報をまとめています。',
            'canonical_url' => $this->absoluteUrl('/blog'),
            'og_title' => 'すぐタチブログ',
            'og_description' => '使い方、安全に利用するためのポイント、予約前に確認したい情報をまとめています。',
            'json_ld' => [
                '@context' => 'https://schema.org',
                '@type' => 'Blog',
                'name' => 'すぐタチブログ',
                'description' => 'すぐタチの使い方、安全に利用するためのポイント、男性向けリラクゼーションの予約前に確認したい情報をまとめています。',
                'url' => $this->absoluteUrl('/blog'),
                'isPartOf' => [
                    '@type' => 'WebSite',
                    'name' => $this->serviceName(),
                    'url' => rtrim((string) config('app.url'), '/').'/',
                ],
            ],
        ]);
    }

    public function blogPost(BlogPost $post): array
    {
        $canonicalUrl = filled($post->canonical_url) ? (string) $post->canonical_url : $this->absoluteUrl($post->publicUrl());
        $title = $post->meta_title ?: $post->title;
        $description = $post->meta_description ?: ($post->excerpt ?: Str::limit(strip_tags((string) $post->body_html), 120));
        $imageUrl = $post->coverImageUrl() ? $this->absoluteUrl($post->coverImageUrl()) : asset('images/ogp/default.jpg');

        return $this->merge([
            'title' => $title.' | '.$this->serviceName(),
            'description' => $description,
            'canonical_url' => $canonicalUrl,
            'og_title' => $post->og_title ?: $title,
            'og_description' => $post->og_description ?: $description,
            'og_type' => 'article',
            'og_image_url' => $imageUrl,
            'robots' => $post->noindex ? 'noindex,nofollow' : null,
            'article_published_time' => $post->published_at?->toAtomString(),
            'article_modified_time' => $post->updated_at?->toAtomString(),
            'json_ld' => [
                '@context' => 'https://schema.org',
                '@type' => 'BlogPosting',
                'headline' => $post->title,
                'description' => $description,
                'image' => [$imageUrl],
                'datePublished' => $post->published_at?->toAtomString(),
                'dateModified' => $post->updated_at?->toAtomString(),
                'mainEntityOfPage' => $canonicalUrl,
                'publisher' => [
                    '@type' => 'Organization',
                    'name' => $this->serviceName(),
                    'url' => rtrim((string) config('app.url'), '/').'/',
                ],
            ],
        ]);
    }

    private function merge(array $meta): array
    {
        return array_replace($this->default(), $meta);
    }

    private function serviceName(): string
    {
        $serviceName = trim((string) config('service_meta.name', config('app.name', '')));

        return $serviceName !== '' ? $serviceName : 'すぐタチ';
    }

    private function absoluteUrl(string $path): string
    {
        if (Str::startsWith($path, ['http://', 'https://'])) {
            return $path;
        }

        return rtrim((string) config('app.url'), '/').'/'.ltrim($path, '/');
    }
}
