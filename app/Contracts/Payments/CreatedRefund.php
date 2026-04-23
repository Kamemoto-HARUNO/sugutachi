<?php

namespace App\Contracts\Payments;

class CreatedRefund
{
    public function __construct(
        public readonly string $id,
        public readonly string $status,
    ) {}
}
