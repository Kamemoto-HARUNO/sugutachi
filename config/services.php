<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'stripe' => [
        'secret' => env('STRIPE_SECRET'),
        'publishable_key' => env('STRIPE_PUBLISHABLE_KEY'),
        'webhook_secret' => env('STRIPE_WEBHOOK_SECRET'),
        'currency' => env('STRIPE_CURRENCY', 'jpy'),
        'connect_country' => env('STRIPE_CONNECT_COUNTRY', 'JP'),
        'connect_return_url' => env('STRIPE_CONNECT_RETURN_URL', rtrim((string) env('APP_URL', 'http://localhost'), '/').'/therapist/stripe-connect'),
        'connect_refresh_url' => env('STRIPE_CONNECT_REFRESH_URL', rtrim((string) env('APP_URL', 'http://localhost'), '/').'/therapist/stripe-connect'),
    ],

    'nominatim' => [
        'base_url' => env('NOMINATIM_BASE_URL', 'https://nominatim.openstreetmap.org'),
        'user_agent' => env('NOMINATIM_USER_AGENT', sprintf('%s location-search', (string) env('APP_NAME', 'Sugutachi'))),
    ],

    'web_push' => [
        'public_key' => env('WEB_PUSH_VAPID_PUBLIC_KEY'),
        'private_key' => env('WEB_PUSH_VAPID_PRIVATE_KEY'),
        'subject' => env('WEB_PUSH_VAPID_SUBJECT'),
    ],

    'gtm' => [
        'enabled' => filter_var(env('GTM_ENABLED', false), FILTER_VALIDATE_BOOL),
        'container_id' => env('GTM_CONTAINER_ID'),
        'auth' => env('GTM_AUTH'),
        'preview' => env('GTM_PREVIEW'),
    ],

];
