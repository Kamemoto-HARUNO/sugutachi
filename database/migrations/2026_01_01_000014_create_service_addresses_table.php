<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_addresses', function (Blueprint $table) {
            $table->id();
            $table->string('public_id', 36)->unique();
            $table->foreignId('account_id')->constrained('accounts')->restrictOnDelete();
            $table->string('label', 80)->nullable();
            $table->string('place_type', 50);
            $table->text('postal_code_encrypted')->nullable();
            $table->string('prefecture', 50)->nullable();
            $table->string('city', 100)->nullable();
            $table->text('address_line_encrypted');
            $table->text('building_encrypted')->nullable();
            $table->text('access_notes_encrypted')->nullable();
            $table->decimal('lat', 10, 7);
            $table->decimal('lng', 10, 7);
            $table->string('geohash', 12)->nullable();
            $table->boolean('is_default')->default(false);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['account_id', 'is_default']);
            $table->index(['prefecture', 'city']);
            $table->index(['lat', 'lng']);
            $table->index('geohash');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_addresses');
    }
};
