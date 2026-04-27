<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta
            name="description"
            content="すぐタチ - リラクゼーション / ボディケア / もみほぐしの予約・マッチングサービス"
        >
        <meta name="theme-color" content="#17202b">

        <title>{{ config('service_meta.name', config('app.name', 'すぐタチ')) }}</title>

        <link rel="icon" href="/favicon.ico" sizes="any">
        <link rel="apple-touch-icon" href="/apple-touch-icon.png">
        <link rel="manifest" href="/manifest.webmanifest">
        <meta name="apple-mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-status-bar-style" content="default">
        <meta property="og:image" content="/logo-horizontal.png">
        <meta name="twitter:image" content="/logo-horizontal.png">

        <link rel="preconnect" href="https://fonts.bunny.net">
        <link href="https://fonts.bunny.net/css?family=instrument-sans:400,500,600,700" rel="stylesheet" />

        @vite(['resources/css/app.css', 'resources/js/app.tsx'])
    </head>
    <body>
        <div id="app"></div>
    </body>
</html>
