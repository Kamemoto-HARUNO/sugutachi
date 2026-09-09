<?php

namespace App\Services\Payments;

use Illuminate\Support\Facades\DB;
use RuntimeException;

class LocalPaymentSimulation
{
    public function enabled(): bool
    {
        if (! app()->environment('local')
            || ! config('services.stripe.local_simulation', false)
            || filled(config('services.stripe.secret'))
            || ! in_array(parse_url(config('app.url'), PHP_URL_HOST), ['localhost', '127.0.0.1', '::1'], true)
            || config('database.default') !== 'sqlite') {
            return false;
        }

        $database = DB::connection();
        $expected = realpath(database_path('dm-preview.sqlite'));

        return $database->getDriverName() === 'sqlite'
            && $expected !== false
            && realpath($database->getDatabaseName()) === $expected;
    }

    public function assertEnabled(?string $paymentId = null): void
    {
        if (! $this->enabled() || ($paymentId !== null && ! str_starts_with($paymentId, 'pi_local_'))) {
            throw new RuntimeException('Local payment simulation is unavailable for this payment.');
        }
    }
}
