<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('booking_quotes', function (Blueprint $table) {
            $table->id();
            $table->string('public_id', 36)->unique();
            $table->foreignId('booking_id')->nullable()->constrained('bookings')->cascadeOnDelete();
            $table->foreignId('therapist_profile_id')->constrained('therapist_profiles')->restrictOnDelete();
            $table->foreignId('therapist_menu_id')->constrained('therapist_menus')->restrictOnDelete();
            $table->unsignedInteger('duration_minutes');
            $table->unsignedInteger('base_amount')->default(0);
            $table->unsignedInteger('travel_fee_amount')->default(0);
            $table->unsignedInteger('night_fee_amount')->default(0);
            $table->unsignedInteger('demand_fee_amount')->default(0);
            $table->integer('profile_adjustment_amount')->default(0);
            $table->unsignedInteger('matching_fee_amount')->default(0);
            $table->unsignedInteger('platform_fee_amount')->default(0);
            $table->unsignedInteger('total_amount')->default(0);
            $table->unsignedInteger('therapist_gross_amount')->default(0);
            $table->unsignedInteger('therapist_net_amount')->default(0);
            $table->string('calculation_version', 50);
            $table->json('input_snapshot_json');
            $table->json('applied_rules_json');
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();

            $table->index('booking_id');
            $table->index(['therapist_profile_id', 'created_at']);
            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_quotes');
    }
};
