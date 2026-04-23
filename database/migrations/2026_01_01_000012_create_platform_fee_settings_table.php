<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('platform_fee_settings', function (Blueprint $table) {
            $table->id();
            $table->string('setting_key', 100);
            $table->json('value_json');
            $table->timestamp('active_from')->nullable();
            $table->timestamp('active_until')->nullable();
            $table->foreignId('created_by_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->timestamps();

            $table->unique(['setting_key', 'active_from']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_fee_settings');
    }
};
