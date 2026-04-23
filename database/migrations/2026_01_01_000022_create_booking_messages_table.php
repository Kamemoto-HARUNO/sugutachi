<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('booking_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->constrained('bookings')->cascadeOnDelete();
            $table->foreignId('sender_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->string('message_type', 50);
            $table->text('body_encrypted');
            $table->boolean('detected_contact_exchange')->default(false);
            $table->string('moderation_status', 50)->default('ok');
            $table->timestamp('sent_at');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->index(['booking_id', 'sent_at']);
            $table->index(['sender_account_id', 'sent_at']);
            $table->index('moderation_status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_messages');
    }
};
