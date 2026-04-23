<?php

namespace App\Contracts\Payments;

class CreatedPaymentIntent
{
    public function __construct(
        public readonly string $id,
        public readonly ?string $clientSecret,
        public readonly string $status,
    ) {}
}
