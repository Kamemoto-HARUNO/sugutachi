<?php

use App\Services\Pricing\BookingQuoteCalculator;

$baseUrl = rtrim((string) env('APP_URL', 'http://localhost'), '/');
$domain = (string) (env('SERVICE_DOMAIN') ?: parse_url($baseUrl, PHP_URL_HOST) ?: 'localhost');

return [
    'name' => env('APP_NAME', 'すぐタチ'),
    'domain' => $domain,
    'base_url' => env('SERVICE_BASE_URL', $baseUrl),
    'support_email' => env('SERVICE_SUPPORT_EMAIL', 'support@'.$domain),
    'contact' => [
        'form_enabled' => true,
        'reply_channel' => 'email',
    ],
    'fees' => [
        'currency' => env('STRIPE_CURRENCY', 'jpy'),
        'matching_fee_amount' => BookingQuoteCalculator::MATCHING_FEE_AMOUNT,
        'platform_fee_rate' => BookingQuoteCalculator::PLATFORM_FEE_RATE,
    ],
    'booking' => [
        'minimum_age' => 18,
        'payment_methods' => ['card'],
        'walking_time_estimation' => [
            'mode' => 'straight_line',
            'meters_per_minute' => 80,
        ],
    ],
    'legal' => [
        'document_types' => ['terms', 'privacy', 'commerce'],
    ],
];
