<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->foreignId('availability_slot_id')
                ->nullable()
                ->after('current_quote_id')
                ->constrained('therapist_availability_slots')
                ->nullOnDelete();
            $table->unsignedInteger('buffer_before_minutes')->default(0)->after('duration_minutes');
            $table->unsignedInteger('buffer_after_minutes')->default(0)->after('buffer_before_minutes');
            $table->text('cancel_reason_note_encrypted')->nullable()->after('cancel_reason_code');

            $table->index('availability_slot_id');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->dropIndex(['availability_slot_id']);
            $table->dropConstrainedForeignId('availability_slot_id');
            $table->dropColumn([
                'buffer_before_minutes',
                'buffer_after_minutes',
                'cancel_reason_note_encrypted',
            ]);
        });
    }
};
