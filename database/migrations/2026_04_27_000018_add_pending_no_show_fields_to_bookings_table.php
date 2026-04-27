<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->timestamp('pending_no_show_reported_at')->nullable()->after('interrupted_at');
            $table->foreignId('pending_no_show_reported_by_account_id')->nullable()->after('pending_no_show_reported_at')->constrained('accounts')->nullOnDelete();
            $table->string('pending_no_show_reason_code', 100)->nullable()->after('pending_no_show_reported_by_account_id');
            $table->text('pending_no_show_note_encrypted')->nullable()->after('pending_no_show_reason_code');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropConstrainedForeignId('pending_no_show_reported_by_account_id');
            $table->dropColumn([
                'pending_no_show_reported_at',
                'pending_no_show_reason_code',
                'pending_no_show_note_encrypted',
            ]);
        });
    }
};
