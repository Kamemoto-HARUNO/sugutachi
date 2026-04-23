<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('therapist_locations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('therapist_profile_id')->unique()->constrained('therapist_profiles')->cascadeOnDelete();
            $table->decimal('lat', 10, 7);
            $table->decimal('lng', 10, 7);
            $table->string('geohash', 12)->nullable();
            $table->unsignedInteger('accuracy_m')->nullable();
            $table->string('source', 50)->default('browser');
            $table->boolean('is_searchable')->default(false);
            $table->timestamps();

            $table->index(['is_searchable', 'updated_at']);
            $table->index(['lat', 'lng']);
            $table->index('geohash');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('therapist_locations');
    }
};
