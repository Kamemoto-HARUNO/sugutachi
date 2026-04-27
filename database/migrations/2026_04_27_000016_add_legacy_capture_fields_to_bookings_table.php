<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->unsignedInteger('settlement_total_amount')->nullable()->after('matching_fee_amount');
            $table->unsignedInteger('settlement_therapist_net_amount')->nullable()->after('settlement_total_amount');
            $table->unsignedInteger('settlement_platform_fee_amount')->nullable()->after('settlement_therapist_net_amount');
            $table->unsignedInteger('settlement_matching_fee_amount')->nullable()->after('settlement_platform_fee_amount');
            $table->unsignedInteger('uncaptured_extension_amount')->default(0)->after('settlement_matching_fee_amount');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn([
                'settlement_total_amount',
                'settlement_therapist_net_amount',
                'settlement_platform_fee_amount',
                'settlement_matching_fee_amount',
                'uncaptured_extension_amount',
            ]);
        });
    }
};
