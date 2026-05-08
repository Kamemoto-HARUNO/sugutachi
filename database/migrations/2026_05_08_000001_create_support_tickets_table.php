<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('support_tickets', function (Blueprint $table): void {
            $table->id();
            $table->string('public_id')->unique();
            $table->foreignId('account_id')->constrained('accounts')->cascadeOnDelete();
            $table->string('requester_role', 50);
            $table->string('origin', 50);
            $table->string('title', 160);
            $table->string('category', 50);
            $table->string('status', 50)->default('open');
            $table->foreignId('created_by_account_id')->constrained('accounts')->cascadeOnDelete();
            $table->foreignId('completed_by_admin_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('last_message_at')->nullable();
            $table->timestamps();

            $table->index(['account_id', 'status', 'last_message_at']);
            $table->index(['status', 'last_message_at']);
            $table->index(['category', 'status']);
            $table->index(['origin', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('support_tickets');
    }
};
