<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('therapist_booking_settings', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('therapist_profile_id')->unique()->constrained('therapist_profiles')->cascadeOnDelete();
            $table->unsignedInteger('booking_request_lead_time_minutes')->default(60);
            $table->string('scheduled_base_label', 120)->nullable();
            $table->decimal('scheduled_base_lat', 10, 7);
            $table->decimal('scheduled_base_lng', 10, 7);
            $table->string('scheduled_base_geohash', 12)->nullable();
            $table->unsignedInteger('scheduled_base_accuracy_m')->nullable();
            $table->timestamps();

            $table->index('scheduled_base_geohash');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('therapist_booking_settings');
    }
};
