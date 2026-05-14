<?php

use App\Http\Controllers\Api\StripeWebhookController;
use App\Models\BlogPost;
use App\Models\BlogSlugRedirect;
use App\Services\Seo\GayMassageAreaCatalog;
use App\Services\Seo\PageMetaFactory;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Support\Facades\Route;

Route::post('/webhooks/stripe', StripeWebhookController::class)
    ->withoutMiddleware(PreventRequestForgery::class);

Route::get('/sitemap.xml', function () {
    $baseUrl = rtrim((string) config('app.url'), '/');
    $staticPaths = ['/', '/first-time', '/help', '/blog', '/gay-massage'];
    $urls = collect($staticPaths)->map(fn (string $path) => [
        'loc' => $baseUrl.$path,
        'lastmod' => now()->toAtomString(),
    ]);

    $posts = BlogPost::query()
        ->visibleToPublic()
        ->where('noindex', false)
        ->orderByDesc('published_at')
        ->get(['slug', 'updated_at'])
        ->map(fn (BlogPost $post) => [
            'loc' => $baseUrl.'/blog/'.$post->slug,
            'lastmod' => $post->updated_at?->toAtomString() ?? now()->toAtomString(),
        ]);

    $writer = new XMLWriter;
    $writer->openMemory();
    $writer->startDocument('1.0', 'UTF-8');
    $writer->startElement('urlset');
    $writer->writeAttribute('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9');

    $gayMassageAreas = app(GayMassageAreaCatalog::class)->activeAreas()->map(fn (array $area) => [
        'loc' => $baseUrl.'/gay-massage/'.$area['slug'],
        'lastmod' => now()->toAtomString(),
    ]);

    foreach ($urls->merge($gayMassageAreas)->merge($posts) as $url) {
        $writer->startElement('url');
        $writer->writeElement('loc', $url['loc']);
        $writer->writeElement('lastmod', $url['lastmod']);
        $writer->endElement();
    }

    $writer->endElement();
    $writer->endDocument();

    return response($writer->outputMemory(), 200, ['Content-Type' => 'application/xml']);
});

Route::get('/gay-massage', function (PageMetaFactory $meta) {
    return view('app', ['seoMeta' => $meta->gayMassageIndex()]);
});

Route::get('/gay-massage/{slug}', function (string $slug, GayMassageAreaCatalog $catalog, PageMetaFactory $meta) {
    $area = $catalog->findArea($slug);

    if (! $area || $catalog->therapistCount($area['slug']) === 0) {
        abort(404);
    }

    return view('app', ['seoMeta' => $meta->gayMassageArea($area)]);
});

Route::get('/robots.txt', function () {
    $baseUrl = rtrim((string) config('app.url'), '/');

    return response("User-agent: *\nAllow: /\nSitemap: {$baseUrl}/sitemap.xml\n", 200, ['Content-Type' => 'text/plain']);
});

Route::get('/blog', function (PageMetaFactory $meta) {
    return view('app', ['seoMeta' => $meta->blogIndex()]);
});

Route::get('/blog/{slug}', function (string $slug, PageMetaFactory $meta) {
    $post = BlogPost::query()
        ->where('slug', $slug)
        ->first();

    if ($post?->isVisibleToPublic()) {
        return view('app', ['seoMeta' => $meta->blogPost($post)]);
    }

    $redirect = BlogSlugRedirect::query()->where('old_slug', $slug)->first();

    if ($redirect) {
        return redirect('/blog/'.$redirect->new_slug, 301);
    }

    abort(404);
});

Route::view('/{path?}', 'app')
    ->where('path', '^(?!api(?:/|$)|webhooks/stripe$).*$');
