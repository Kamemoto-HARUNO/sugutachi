<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->timestamp('therapist_pre_departure_reminder_sent_at')->nullable()->after('confirmed_at');
            $table->timestamp('therapist_departure_reminder_sent_at')->nullable()->after('therapist_pre_departure_reminder_sent_at');

            $table->index(['status', 'scheduled_start_at']);
            $table->index(['status', 'therapist_pre_departure_reminder_sent_at']);
            $table->index(['status', 'therapist_departure_reminder_sent_at']);
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->dropIndex(['status', 'scheduled_start_at']);
            $table->dropIndex(['status', 'therapist_pre_departure_reminder_sent_at']);
            $table->dropIndex(['status', 'therapist_departure_reminder_sent_at']);

            $table->dropColumn([
                'therapist_pre_departure_reminder_sent_at',
                'therapist_departure_reminder_sent_at',
            ]);
        });
    }
};
