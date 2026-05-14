@php
    $gtmEnabled = (bool) config('services.gtm.enabled');
    $gtmContainerId = trim((string) config('services.gtm.container_id'));
    $gtmAuth = trim((string) config('services.gtm.auth'));
    $gtmPreview = trim((string) config('services.gtm.preview'));
    $seoMeta = $seoMeta ?? [];
    $serviceName = trim((string) config('service_meta.name', config('app.name', '')));
    $serviceName = $serviceName !== '' ? $serviceName : 'すぐタチ';
    $defaultOgpDescription = 'リラクゼーション / ボディケア / もみほぐしの予約・マッチングサービス';
    $defaultOgpTitle = $serviceName.' - '.$defaultOgpDescription;
    $seoTitle = $seoMeta['title'] ?? $defaultOgpTitle;
    $seoDescription = $seoMeta['description'] ?? $defaultOgpDescription;
    $defaultOgpUrl = $seoMeta['canonical_url'] ?? url()->current();
    $defaultOgpImageUrl = $seoMeta['og_image_url'] ?? asset('images/ogp/default.jpg');
    $seoOgTitle = $seoMeta['og_title'] ?? $seoTitle;
    $seoOgDescription = $seoMeta['og_description'] ?? $seoDescription;
    $seoOgType = $seoMeta['og_type'] ?? 'website';
    $seoRobots = $seoMeta['robots'] ?? null;
    $seoJsonLd = $seoMeta['json_ld'] ?? null;
    $hasGtmEnvironment = $gtmAuth !== '' && $gtmPreview !== '';
    $gtmQuery = http_build_query(array_filter([
        'id' => $gtmContainerId !== '' ? $gtmContainerId : null,
        'gtm_auth' => $hasGtmEnvironment ? $gtmAuth : null,
        'gtm_preview' => $hasGtmEnvironment ? $gtmPreview : null,
        'gtm_cookies_win' => $hasGtmEnvironment ? 'x' : null,
    ]));
    $gtmScriptUrl = $gtmQuery !== '' ? 'https://www.googletagmanager.com/gtm.js?'.$gtmQuery : null;
    $gtmFrameUrl = $gtmQuery !== '' ? 'https://www.googletagmanager.com/ns.html?'.$gtmQuery : null;
    $shouldRenderGtm = $gtmEnabled && $gtmContainerId !== '' && $gtmScriptUrl !== null && $gtmFrameUrl !== null;
@endphp
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta
            name="description"
            content="{{ $seoDescription }}"
        >
        <meta name="theme-color" content="#17202b">

        <title>{{ $seoTitle }}</title>

        <link rel="icon" href="/favicon.ico" sizes="any">
        <link rel="apple-touch-icon" href="/apple-touch-icon.png">
        <link rel="manifest" href="/manifest.webmanifest">
        <link rel="canonical" href="{{ $defaultOgpUrl }}">
        <meta name="mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-status-bar-style" content="default">
        <meta property="og:type" content="{{ $seoOgType }}">
        <meta property="og:site_name" content="{{ $serviceName }}">
        <meta property="og:title" content="{{ $seoOgTitle }}">
        <meta property="og:description" content="{{ $seoOgDescription }}">
        <meta property="og:url" content="{{ $defaultOgpUrl }}">
        <meta property="og:image" content="{{ $defaultOgpImageUrl }}">
        <meta property="og:image:secure_url" content="{{ $defaultOgpImageUrl }}">
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="{{ $seoOgTitle }}">
        <meta name="twitter:description" content="{{ $seoOgDescription }}">
        <meta name="twitter:image" content="{{ $defaultOgpImageUrl }}">
        @if ($seoRobots)
            <meta name="robots" content="{{ $seoRobots }}">
        @endif
        @if (($seoMeta['article_published_time'] ?? null) && $seoOgType === 'article')
            <meta property="article:published_time" content="{{ $seoMeta['article_published_time'] }}">
        @endif
        @if (($seoMeta['article_modified_time'] ?? null) && $seoOgType === 'article')
            <meta property="article:modified_time" content="{{ $seoMeta['article_modified_time'] }}">
        @endif
        @if ($seoJsonLd)
            <script type="application/ld+json" id="server-json-ld">{!! json_encode($seoJsonLd, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) !!}</script>
        @endif

        <link rel="preconnect" href="https://fonts.bunny.net">
        <link href="https://fonts.bunny.net/css?family=instrument-sans:400,500,600,700" rel="stylesheet" />

        @if ($shouldRenderGtm)
            <script>
                window.dataLayer = window.dataLayer || [];
                window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
                (function (document, tagName, sourceUrl) {
                    const firstScript = document.getElementsByTagName(tagName)[0];
                    const script = document.createElement(tagName);
                    script.async = true;
                    script.src = sourceUrl;
                    firstScript.parentNode.insertBefore(script, firstScript);
                })(document, 'script', @json($gtmScriptUrl));
            </script>
        @endif

        @viteReactRefresh
        @vite(['resources/css/app.css', 'resources/js/app.tsx'])
    </head>
    <body>
        @if ($shouldRenderGtm)
            <noscript>
                <iframe
                    src="{{ $gtmFrameUrl }}"
                    height="0"
                    width="0"
                    style="display:none;visibility:hidden"
                    title="gtm"
                ></iframe>
            </noscript>
        @endif
        <div id="app"></div>
    </body>
</html>
