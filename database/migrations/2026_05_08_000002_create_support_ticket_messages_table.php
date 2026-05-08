<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('support_ticket_messages', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('support_ticket_id')->constrained('support_tickets')->cascadeOnDelete();
            $table->foreignId('sender_account_id')->constrained('accounts')->cascadeOnDelete();
            $table->string('sender_role', 50);
            $table->string('message_type', 50);
            $table->text('body_encrypted')->nullable();
            $table->text('attachment_storage_key_encrypted')->nullable();
            $table->string('attachment_original_name')->nullable();
            $table->string('attachment_mime_type', 120)->nullable();
            $table->unsignedBigInteger('attachment_size_bytes')->nullable();
            $table->timestamp('sent_at');
            $table->timestamp('read_by_user_at')->nullable();
            $table->timestamp('read_by_admin_at')->nullable();
            $table->timestamps();

            $table->index(['support_ticket_id', 'sent_at']);
            $table->index(['sender_account_id', 'sent_at']);
            $table->index(['support_ticket_id', 'read_by_user_at']);
            $table->index(['support_ticket_id', 'read_by_admin_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('support_ticket_messages');
    }
};
