<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->timestamp('therapist_adjustment_proposed_at')->nullable()->after('request_expires_at');
            $table->timestamp('therapist_adjustment_start_at')->nullable()->after('therapist_adjustment_proposed_at');
            $table->timestamp('therapist_adjustment_end_at')->nullable()->after('therapist_adjustment_start_at');
            $table->unsignedInteger('therapist_adjustment_duration_minutes')->nullable()->after('therapist_adjustment_end_at');
            $table->unsignedInteger('therapist_adjustment_total_amount')->nullable()->after('therapist_adjustment_duration_minutes');
            $table->unsignedInteger('therapist_adjustment_therapist_net_amount')->nullable()->after('therapist_adjustment_total_amount');
            $table->unsignedInteger('therapist_adjustment_platform_fee_amount')->nullable()->after('therapist_adjustment_therapist_net_amount');
            $table->unsignedInteger('therapist_adjustment_matching_fee_amount')->nullable()->after('therapist_adjustment_platform_fee_amount');
            $table->unsignedInteger('therapist_adjustment_buffer_before_minutes')->nullable()->after('therapist_adjustment_matching_fee_amount');
            $table->unsignedInteger('therapist_adjustment_buffer_after_minutes')->nullable()->after('therapist_adjustment_buffer_before_minutes');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn([
                'therapist_adjustment_proposed_at',
                'therapist_adjustment_start_at',
                'therapist_adjustment_end_at',
                'therapist_adjustment_duration_minutes',
                'therapist_adjustment_total_amount',
                'therapist_adjustment_therapist_net_amount',
                'therapist_adjustment_platform_fee_amount',
                'therapist_adjustment_matching_fee_amount',
                'therapist_adjustment_buffer_before_minutes',
                'therapist_adjustment_buffer_after_minutes',
            ]);
        });
    }
};
