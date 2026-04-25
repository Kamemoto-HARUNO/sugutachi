<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('booking_messages', function (Blueprint $table) {
            $table->foreignId('moderated_by_admin_account_id')
                ->nullable()
                ->after('sender_account_id')
                ->constrained('accounts')
                ->nullOnDelete();
            $table->timestamp('moderated_at')->nullable()->after('moderation_status');

            $table->index(['moderated_by_admin_account_id', 'moderated_at'], 'bm_moderated_admin_at_idx');
        });
    }

    public function down(): void
    {
        Schema::table('booking_messages', function (Blueprint $table) {
            $table->dropIndex('bm_moderated_admin_at_idx');
            $table->dropConstrainedForeignId('moderated_by_admin_account_id');
            $table->dropColumn('moderated_at');
        });
    }
};
