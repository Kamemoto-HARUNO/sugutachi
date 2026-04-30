<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CampaignOfferResource;
use App\Services\Campaigns\CampaignService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class UserCampaignOfferController extends Controller
{
    public function index(Request $request, CampaignService $campaignService): AnonymousResourceCollection
    {
        return CampaignOfferResource::collection(
            $campaignService->userCampaignOffers($request->user())
        );
    }
}
