<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('support_step_scenarios', function (Blueprint $table): void {
            $table->id();
            $table->string('public_id')->unique();
            $table->string('name', 120);
            $table->string('status', 50)->default('draft')->index();
            $table->string('target_role', 50)->index();
            $table->string('identity_verification_status', 50)->index();
            $table->unsignedTinyInteger('elapsed_days');
            $table->time('send_time');
            $table->unsignedSmallInteger('priority')->default(100)->index();
            $table->string('ticket_title', 160);
            $table->string('ticket_category', 50)->default('account');
            $table->text('message_body');
            $table->text('internal_notes')->nullable();
            $table->foreignId('created_by_account_id')->constrained('accounts')->cascadeOnDelete();
            $table->foreignId('updated_by_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->foreignId('archived_by_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->timestamp('archived_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'send_time']);
            $table->index(['target_role', 'identity_verification_status', 'elapsed_days']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('support_step_scenarios');
    }
};
