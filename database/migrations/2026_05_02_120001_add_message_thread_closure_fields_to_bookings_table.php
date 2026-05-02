<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->timestamp('messages_closed_at')->nullable()->after('interruption_reason_code');
            $table->foreignId('messages_closed_by_account_id')
                ->nullable()
                ->after('messages_closed_at')
                ->constrained('accounts')
                ->nullOnDelete();

            $table->index(['messages_closed_at', 'messages_closed_by_account_id']);
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropConstrainedForeignId('messages_closed_by_account_id');
            $table->dropColumn('messages_closed_at');
        });
    }
};
