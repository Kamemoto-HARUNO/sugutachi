<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('therapist_pricing_rules', function (Blueprint $table): void {
            $table->string('monitoring_status', 50)->default('unreviewed')->after('is_active');
            $table->foreignId('monitored_by_admin_account_id')
                ->nullable()
                ->after('monitoring_status')
                ->constrained('accounts')
                ->nullOnDelete();
            $table->timestamp('monitored_at')->nullable()->after('monitored_by_admin_account_id');

            $table->index(['monitoring_status', 'is_active']);
            $table->index(['monitored_by_admin_account_id', 'monitored_at']);
        });
    }

    public function down(): void
    {
        Schema::table('therapist_pricing_rules', function (Blueprint $table): void {
            $table->dropIndex(['monitoring_status', 'is_active']);
            $table->dropIndex(['monitored_by_admin_account_id', 'monitored_at']);
            $table->dropConstrainedForeignId('monitored_by_admin_account_id');
            $table->dropColumn(['monitoring_status', 'monitored_at']);
        });
    }
};
