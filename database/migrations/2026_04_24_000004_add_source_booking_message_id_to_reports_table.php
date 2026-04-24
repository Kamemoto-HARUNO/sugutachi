<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->foreignId('source_booking_message_id')
                ->nullable()
                ->after('booking_id')
                ->constrained('booking_messages')
                ->nullOnDelete();

            $table->index(['source_booking_message_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->dropIndex(['source_booking_message_id', 'status']);
            $table->dropConstrainedForeignId('source_booking_message_id');
        });
    }
};
