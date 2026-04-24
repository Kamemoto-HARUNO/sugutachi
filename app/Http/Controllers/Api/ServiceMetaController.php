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
                'legal_document_types' => config('service_meta.legal.document_types', []),
            ],
        ]);
    }
}
