<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

class ServiceMetaController extends Controller
{
    public function show(): JsonResponse
    {
        return response()->json([
            'data' => [
                'service_name' => config('service_meta.name'),
                'domain' => config('service_meta.domain'),
                'base_url' => config('service_meta.base_url'),
                'support_email' => config('service_meta.support_email'),
                'contact' => [
                    'form_enabled' => (bool) config('service_meta.contact.form_enabled', true),
                    'reply_channel' => config('service_meta.contact.reply_channel', 'email'),
                ],
                'fees' => [
                    'currency' => config('service_meta.fees.currency'),
                    'matching_fee_amount' => (int) config('service_meta.fees.matching_fee_amount', 0),
                    'platform_fee_rate' => (float) config('service_meta.fees.platform_fee_rate', 0),
                ],
                'booking' => [
                    'minimum_age' => (int) config('service_meta.booking.minimum_age', 18),
                    'payment_methods' => config('service_meta.booking.payment_methods', ['card']),
                    'walking_time_estimation' => config('service_meta.booking.walking_time_estimation', []),
                ],
                'commerce_notice' => [
                    'operator_name' => config('service_meta.commerce.operator_name'),
                    'representative_name' => config('service_meta.commerce.representative_name'),
                    'business_address' => config('service_meta.commerce.business_address'),
                    'phone_number' => config('service_meta.commerce.phone_number'),
                    'contact_email' => config('service_meta.support_email'),
                    'inquiry_hours' => config('service_meta.commerce.inquiry_hours'),
                    'payment_timing' => config('service_meta.commerce.payment_timing'),
                    'service_delivery_timing' => config('service_meta.commerce.service_delivery_timing'),
                    'cancellation_policy_summary' => config('service_meta.commerce.cancellation_policy_summary'),
                    'refund_policy_summary' => config('service_meta.commerce.refund_policy_summary'),
                    'supported_payment_methods' => config('service_meta.commerce.supported_payment_methods', ['card']),
                    'legal_document_type' => config('service_meta.commerce.legal_document_type', 'commerce'),
                ],
                'legal_document_types' => config('service_meta.legal.document_types', []),
            ],
        ]);
    }
}
