<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('therapist_travel_requests', function (Blueprint $table): void {
            $table->string('monitoring_status', 50)->default('unreviewed')->after('status');
            $table->foreignId('monitored_by_admin_account_id')
                ->nullable()
                ->after('monitoring_status')
                ->constrained('accounts')
                ->nullOnDelete();
            $table->timestamp('monitored_at')->nullable()->after('monitored_by_admin_account_id');

            $table->index(['monitoring_status', 'status', 'created_at'], 'ttr_monitoring_status_created_idx');
            $table->index(['monitored_by_admin_account_id', 'monitored_at'], 'ttr_monitored_admin_at_idx');
        });
    }

    public function down(): void
    {
        Schema::table('therapist_travel_requests', function (Blueprint $table): void {
            $table->dropIndex('ttr_monitoring_status_created_idx');
            $table->dropIndex('ttr_monitored_admin_at_idx');
            $table->dropConstrainedForeignId('monitored_by_admin_account_id');
            $table->dropColumn(['monitoring_status', 'monitored_at']);
        });
    }
};
