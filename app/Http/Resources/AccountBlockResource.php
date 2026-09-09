<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AccountBlockResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'scope' => 'legacy_account',
            'label' => '既存のブロック設定',
            'reason_code' => $this->reason_code,
            'created_at' => $this->created_at,
        ];
    }
}
