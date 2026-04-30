<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('booking_quotes', function (Blueprint $table) {
            $table->foreignId('discount_campaign_id')->nullable()->after('booking_id')->constrained('campaigns')->nullOnDelete();
            $table->unsignedInteger('discount_amount')->default(0)->after('platform_fee_amount');
            $table->unsignedInteger('discounted_matching_fee_amount')->default(0)->after('discount_amount');
            $table->unsignedInteger('discounted_platform_fee_amount')->default(0)->after('discounted_matching_fee_amount');
            $table->json('discount_snapshot_json')->nullable()->after('applied_rules_json');

            $table->index('discount_campaign_id');
        });
    }

    public function down(): void
    {
        Schema::table('booking_quotes', function (Blueprint $table) {
            $table->dropConstrainedForeignId('discount_campaign_id');
            $table->dropColumn([
                'discount_amount',
                'discounted_matching_fee_amount',
                'discounted_platform_fee_amount',
                'discount_snapshot_json',
            ]);
        });
    }
};
