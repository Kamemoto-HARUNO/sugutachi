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
    'commerce' => [
        'operator_name' => env('SERVICE_COMMERCE_OPERATOR_NAME'),
        'representative_name' => env('SERVICE_COMMERCE_REPRESENTATIVE_NAME'),
        'business_address' => env('SERVICE_COMMERCE_ADDRESS'),
        'phone_number' => env('SERVICE_COMMERCE_PHONE_NUMBER'),
        'inquiry_hours' => env('SERVICE_COMMERCE_INQUIRY_HOURS'),
        'payment_timing' => env('SERVICE_COMMERCE_PAYMENT_TIMING'),
        'service_delivery_timing' => env('SERVICE_COMMERCE_SERVICE_DELIVERY_TIMING'),
        'cancellation_policy_summary' => env('SERVICE_COMMERCE_CANCELLATION_POLICY_SUMMARY'),
        'refund_policy_summary' => env('SERVICE_COMMERCE_REFUND_POLICY_SUMMARY'),
        'supported_payment_methods' => ['card'],
        'legal_document_type' => 'commerce',
    ],
    'legal' => [
        'document_types' => ['terms', 'privacy', 'commerce'],
    ],
];
