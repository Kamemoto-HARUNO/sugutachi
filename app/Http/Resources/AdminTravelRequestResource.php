<?php

namespace App\Http\Resources;

use App\Models\TherapistTravelRequest;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class AdminTravelRequestResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        /** @var TherapistTravelRequest $travelRequest */
        $travelRequest = $this->resource;

        return [
            'public_id' => $travelRequest->public_id,
            'prefecture' => $travelRequest->prefecture,
            'message' => rescue(fn () => Crypt::decryptString($travelRequest->message_encrypted), null, false),
            'status' => $travelRequest->status,
            'monitoring_status' => $travelRequest->monitoring_status,
            'detected_contact_exchange' => $travelRequest->detected_contact_exchange,
            'read_at' => $travelRequest->read_at,
            'archived_at' => $travelRequest->archived_at,
            'monitored_by_admin' => $this->whenLoaded('monitoredByAdmin', fn () => $travelRequest->monitoredByAdmin ? [
                'public_id' => $travelRequest->monitoredByAdmin->public_id,
                'display_name' => $travelRequest->monitoredByAdmin->display_name,
            ] : null),
            'monitored_at' => $travelRequest->monitored_at,
            'admin_note_count' => $this->when(isset($this->admin_notes_count), $this->admin_notes_count),
            'notes' => AdminNoteResource::collection($this->whenLoaded('adminNotes')),
            'sender' => $this->whenLoaded('userAccount', fn () => $travelRequest->userAccount ? [
                'public_id' => $travelRequest->userAccount->public_id,
                'display_name' => $travelRequest->userAccount->display_name,
                'email' => $travelRequest->userAccount->email,
                'status' => $travelRequest->userAccount->status,
            ] : null),
            'therapist_profile' => $this->whenLoaded('therapistProfile', fn () => $travelRequest->therapistProfile ? [
                'public_id' => $travelRequest->therapistProfile->public_id,
                'public_name' => $travelRequest->therapistProfile->public_name,
                'profile_status' => $travelRequest->therapistProfile->profile_status,
                'account' => $travelRequest->therapistProfile->relationLoaded('account') ? [
                    'public_id' => $travelRequest->therapistProfile->account?->public_id,
                    'display_name' => $travelRequest->therapistProfile->account?->display_name,
                    'email' => $travelRequest->therapistProfile->account?->email,
                    'status' => $travelRequest->therapistProfile->account?->status,
                ] : null,
            ] : null),
            'created_at' => $travelRequest->created_at,
            'updated_at' => $travelRequest->updated_at,
        ];
    }
}
