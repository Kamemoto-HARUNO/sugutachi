<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\TherapistBookingSettingResource;
use App\Models\TherapistProfile;
use Illuminate\Http\Request;

class TherapistScheduledBookingSettingController extends Controller
{
    public function show(Request $request): TherapistBookingSettingResource
    {
        $profile = $this->therapistProfile($request);

        return new TherapistBookingSettingResource($profile->bookingSetting);
    }

    public function upsert(Request $request)
    {
        $validated = $request->validate([
            'booking_request_lead_time_minutes' => ['required', 'integer', 'min:15', 'max:10080'],
            'scheduled_base_location.label' => ['nullable', 'string', 'max:120'],
            'scheduled_base_location.lat' => ['required', 'numeric', 'between:-90,90'],
            'scheduled_base_location.lng' => ['required', 'numeric', 'between:-180,180'],
            'scheduled_base_location.accuracy_m' => ['nullable', 'integer', 'min:0', 'max:10000'],
        ]);

        $profile = $this->therapistProfile($request);

        $setting = $profile->bookingSetting()->updateOrCreate(
            ['therapist_profile_id' => $profile->id],
            [
                'booking_request_lead_time_minutes' => $validated['booking_request_lead_time_minutes'],
                'scheduled_base_label' => data_get($validated, 'scheduled_base_location.label'),
                'scheduled_base_lat' => data_get($validated, 'scheduled_base_location.lat'),
                'scheduled_base_lng' => data_get($validated, 'scheduled_base_location.lng'),
                'scheduled_base_accuracy_m' => data_get($validated, 'scheduled_base_location.accuracy_m'),
                'scheduled_base_geohash' => null,
            ],
        );

        return (new TherapistBookingSettingResource($setting->refresh()))
            ->response()
            ->setStatusCode(200);
    }

    private function therapistProfile(Request $request): TherapistProfile
    {
        $profile = $request->user()->therapistProfile()->firstOrFail();

        abort_if(
            $profile->profile_status === TherapistProfile::STATUS_SUSPENDED,
            409,
            'Suspended therapist profiles cannot manage scheduled booking settings.'
        );

        return $profile;
    }
}
