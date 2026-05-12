<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TherapistFavoriteUserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $account = $this->userAccount;

        return [
            'id' => $this->id,
            'created_at' => $this->created_at,
            'user' => [
                'public_id' => $account?->public_id,
                'display_name' => $account?->display_name ?: '利用者',
                'status' => $account?->status,
            ],
        ];
    }
}
