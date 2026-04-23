<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('location_search_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('account_id')->constrained('accounts')->restrictOnDelete();
            $table->decimal('searched_lat', 10, 7)->nullable();
            $table->decimal('searched_lng', 10, 7)->nullable();
            $table->string('searched_geohash', 12)->nullable();
            $table->unsignedInteger('result_count')->default(0);
            $table->string('ip_hash', 64)->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index(['account_id', 'created_at']);
            $table->index(['searched_geohash', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('location_search_logs');
    }
};
