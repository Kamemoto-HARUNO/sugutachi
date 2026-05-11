<?php

use App\Http\Controllers\Api\StripeWebhookController;
use App\Models\BlogPost;
use App\Models\BlogSlugRedirect;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Support\Facades\Route;

Route::post('/webhooks/stripe', StripeWebhookController::class)
    ->withoutMiddleware(PreventRequestForgery::class);

Route::get('/sitemap.xml', function () {
    $baseUrl = rtrim((string) config('app.url'), '/');
    $staticPaths = ['/', '/first-time', '/help', '/blog'];
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

    $xml = view('sitemap', [
        'urls' => $urls->merge($posts),
    ])->render();

    return response($xml, 200, ['Content-Type' => 'application/xml']);
});

Route::get('/robots.txt', function () {
    $baseUrl = rtrim((string) config('app.url'), '/');

    return response("User-agent: *\nAllow: /\nSitemap: {$baseUrl}/sitemap.xml\n", 200, ['Content-Type' => 'text/plain']);
});

Route::get('/blog/{slug}', function (string $slug) {
    if (BlogPost::query()->where('slug', $slug)->exists()) {
        return view('app');
    }

    $redirect = BlogSlugRedirect::query()->where('old_slug', $slug)->first();

    if ($redirect) {
        return redirect('/blog/'.$redirect->new_slug, 301);
    }

    return view('app');
});

Route::view('/{path?}', 'app')
    ->where('path', '^(?!api(?:/|$)|webhooks/stripe$).*$');
