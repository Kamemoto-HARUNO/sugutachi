<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('accounts', function (Blueprint $table): void {
            $table->unsignedInteger('travel_request_warning_count')->default(0)->after('suspension_reason');
            $table->timestamp('travel_request_last_warned_at')->nullable()->after('travel_request_warning_count');
            $table->string('travel_request_last_warning_reason', 100)->nullable()->after('travel_request_last_warned_at');
            $table->timestamp('travel_request_restricted_until')->nullable()->after('travel_request_last_warning_reason');
            $table->string('travel_request_restriction_reason', 100)->nullable()->after('travel_request_restricted_until');

            $table->index('travel_request_restricted_until');
        });
    }

    public function down(): void
    {
        Schema::table('accounts', function (Blueprint $table): void {
            $table->dropIndex(['travel_request_restricted_until']);
            $table->dropColumn([
                'travel_request_warning_count',
                'travel_request_last_warned_at',
                'travel_request_last_warning_reason',
                'travel_request_restricted_until',
                'travel_request_restriction_reason',
            ]);
        });
    }
};
