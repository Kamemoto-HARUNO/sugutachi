<?php

namespace App\Contracts\Payments;

use App\Models\PayoutRequest;

interface PayoutGateway
{
    public function create(PayoutRequest $payoutRequest): CreatedPayout;
}
