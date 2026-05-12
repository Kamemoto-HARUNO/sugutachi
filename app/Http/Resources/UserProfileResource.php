<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class UserProfileResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'profile_status' => $this->profile_status,
            'age_range' => $this->age_range,
            'body_type' => $this->body_type,
            'height_cm' => $this->height_cm,
            'weight_range' => $this->weight_range,
            'preferences' => $this->preferences_json,
            'touch_ng' => $this->touch_ng_json,
            'health_notes' => $this->health_notes_encrypted
                ? Crypt::decryptString($this->health_notes_encrypted)
                : null,
            'sexual_orientation' => $this->sexual_orientation,
            'gender_identity' => $this->gender_identity,
            'disclose_sensitive_profile_to_therapist' => $this->disclose_sensitive_profile_to_therapist,
            'favorite_notify_online' => (bool) ($this->favorite_notify_online ?? true),
            'favorite_notify_availability' => (bool) ($this->favorite_notify_availability ?? true),
            'favorite_email_notifications_enabled' => (bool) ($this->favorite_email_notifications_enabled ?? true),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
