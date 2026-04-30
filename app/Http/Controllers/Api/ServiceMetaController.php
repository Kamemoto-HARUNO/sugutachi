<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CampaignResource;
use App\Models\LegalDocument;
use App\Services\Campaigns\CampaignService;
use Illuminate\Http\JsonResponse;

class ServiceMetaController extends Controller
{
    public function show(CampaignService $campaignService): JsonResponse
    {
        $documentTypes = config('service_meta.legal.document_types', []);
        $latestDocuments = LegalDocument::latestPublishedByTypes($documentTypes);
        $commerceDocumentType = config('service_meta.commerce.legal_document_type', 'commerce');

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
                'payment' => [
                    'stripe_publishable_key' => config('services.stripe.publishable_key'),
                ],
                'push' => [
                    'web_push_public_key' => config('services.web_push.public_key'),
                    'web_push_enabled' => filled(config('services.web_push.public_key'))
                        && filled(config('services.web_push.private_key'))
                        && filled(config('services.web_push.subject')),
                ],
                'campaigns' => CampaignResource::collection($campaignService->publicActiveCampaigns())
                    ->resolve(request()),
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
                    'legal_document' => $this->documentSummary($latestDocuments->get($commerceDocumentType)),
                ],
                'legal_document_types' => $documentTypes,
                'legal_documents' => collect($documentTypes)
                    ->map(fn (string $type) => $latestDocuments->get($type))
                    ->filter()
                    ->map(fn (LegalDocument $document) => $this->documentSummary($document))
                    ->values()
                    ->all(),
            ],
        ]);
    }

    private function documentSummary(?LegalDocument $document): ?array
    {
        if (! $document) {
            return null;
        }

        return [
            'public_id' => $document->public_id,
            'document_type' => $document->document_type,
            'version' => $document->version,
            'title' => $document->title,
            'path' => "/api/legal-documents/{$document->document_type}",
            'accept_path' => "/api/legal-documents/{$document->public_id}/accept",
            'published_at' => $document->published_at,
            'effective_at' => $document->effective_at,
        ];
    }
}
