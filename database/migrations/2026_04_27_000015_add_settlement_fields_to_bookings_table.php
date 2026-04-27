<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->unsignedInteger('actual_duration_minutes')
                ->nullable()
                ->after('duration_minutes');
            $table->dateTime('service_completion_reported_at')
                ->nullable()
                ->after('ended_at');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->dropColumn([
                'actual_duration_minutes',
                'service_completion_reported_at',
            ]);
        });
    }
};
