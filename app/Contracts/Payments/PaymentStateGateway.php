<?php

namespace App\Contracts\Payments;

use App\Models\PaymentIntent;

interface PaymentStateGateway
{
    /** @return array{status: string, refundable_amount: int} */
    public function retrieve(PaymentIntent $payment): array;

    /** @return array{id: string, status: string}|null */
    public function findRefund(PaymentIntent $payment, string $publicId): ?array;

    public function refundStatus(string $refundId): string;
}
