<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('therapist_availability_slots', function (Blueprint $table): void {
            $table->id();
            $table->string('public_id', 36)->unique();
            $table->foreignId('therapist_profile_id')->constrained('therapist_profiles')->cascadeOnDelete();
            $table->timestamp('start_at');
            $table->timestamp('end_at');
            $table->string('status', 50)->default('published');
            $table->string('dispatch_base_type', 50)->default('default');
            $table->string('dispatch_area_label', 120)->nullable();
            $table->string('custom_dispatch_base_label', 120)->nullable();
            $table->decimal('custom_dispatch_base_lat', 10, 7)->nullable();
            $table->decimal('custom_dispatch_base_lng', 10, 7)->nullable();
            $table->string('custom_dispatch_base_geohash', 12)->nullable();
            $table->unsignedInteger('custom_dispatch_base_accuracy_m')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['therapist_profile_id', 'status', 'start_at']);
            $table->index(['dispatch_base_type', 'start_at']);
            $table->index(['status', 'start_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('therapist_availability_slots');
    }
};
