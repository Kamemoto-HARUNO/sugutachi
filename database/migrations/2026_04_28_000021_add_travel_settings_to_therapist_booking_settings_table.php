<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('therapist_booking_settings', function (Blueprint $table): void {
            $table->string('travel_mode', 24)->default('walking')->after('booking_request_lead_time_minutes');
            $table->unsignedInteger('max_travel_minutes')->default(120)->after('travel_mode');
        });
    }

    public function down(): void
    {
        Schema::table('therapist_booking_settings', function (Blueprint $table): void {
            $table->dropColumn(['travel_mode', 'max_travel_minutes']);
        });
    }
};
