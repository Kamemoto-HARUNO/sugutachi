<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->string('arrival_confirmation_code', 4)->nullable()->after('arrived_at');
            $table->timestamp('arrival_confirmation_code_generated_at')->nullable()->after('arrival_confirmation_code');
            $table->timestamp('completed_at')->nullable()->after('ended_at');
            $table->timestamp('completion_confirmation_reminder_sent_at')->nullable()->after('completed_at');

            $table->index(['status', 'completed_at']);
            $table->index(['status', 'completion_confirmation_reminder_sent_at']);
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->dropIndex(['status', 'completed_at']);
            $table->dropIndex(['status', 'completion_confirmation_reminder_sent_at']);
            $table->dropColumn([
                'arrival_confirmation_code',
                'arrival_confirmation_code_generated_at',
                'completed_at',
                'completion_confirmation_reminder_sent_at',
            ]);
        });
    }
};
