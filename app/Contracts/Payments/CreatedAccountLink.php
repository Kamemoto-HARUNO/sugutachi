<?php

namespace App\Contracts\Payments;

use Carbon\CarbonImmutable;

class CreatedAccountLink
{
    public function __construct(
        public readonly string $url,
        public readonly CarbonImmutable $expiresAt,
    ) {}
}
