<?php

namespace Tests\Feature;

use App\Contracts\Payments\PaymentIntentGateway;
use App\Services\Payments\LocalPaymentIntentGateway;
use App\Services\Payments\LocalPaymentSimulation;
use App\Services\Payments\StripePaymentIntentGateway;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class LocalPaymentSimulationGuardTest extends TestCase
{
    public function test_only_opted_in_local_preview_database_without_stripe_credentials_is_enabled(): void
    {
        $directory = sys_get_temp_dir().'/local-payment-guard-'.bin2hex(random_bytes(6));
        mkdir($directory);
        touch($directory.'/dm-preview.sqlite');
        touch($directory.'/other.sqlite');
        try {
            $this->app->useDatabasePath($directory);
            $this->app['env'] = 'local';
            config(['app.url' => 'http://127.0.0.1:8018', 'services.stripe.local_simulation' => true,
                'services.stripe.secret' => null, 'database.default' => 'sqlite',
                'database.connections.sqlite.database' => $directory.'/dm-preview.sqlite']);
            DB::purge('sqlite');
            $guard = app(LocalPaymentSimulation::class);
            $this->assertTrue($guard->enabled());
            $this->assertInstanceOf(LocalPaymentIntentGateway::class, app(PaymentIntentGateway::class));
            foreach (['production', 'staging', 'testing'] as $environment) {
                $this->app['env'] = $environment;
                $this->assertFalse($guard->enabled());
                $this->assertSame(StripePaymentIntentGateway::class, get_class(app(PaymentIntentGateway::class)));
            }
            $this->app['env'] = 'local';
            foreach ([['services.stripe.local_simulation', false], ['services.stripe.secret', 'sk_test_dummy'],
                ['app.url', 'https://sugutachi.com'], ['database.default', 'mysql']] as [$key, $value]) {
                $original = config($key);
                config([$key => $value]);
                $this->assertFalse($guard->enabled());
                config([$key => $original]);
            }
            config(['database.connections.sqlite.database' => $directory.'/other.sqlite']);
            DB::purge('sqlite');
            $this->assertFalse($guard->enabled());
            $this->expectException(\RuntimeException::class);
            $guard->assertEnabled();
        } finally {
            DB::purge('sqlite');
            unlink($directory.'/dm-preview.sqlite');
            unlink($directory.'/other.sqlite');
            rmdir($directory);
        }
    }
}
