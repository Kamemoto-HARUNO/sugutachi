<?php

namespace App\Contracts\Payments;

class CreatedPayout
{
    public function __construct(
        public readonly string $id,
        public readonly string $status,
        public readonly ?string $failureReason = null,
    ) {}
}
