<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('support_step_deliveries', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('support_step_scenario_id')->constrained('support_step_scenarios')->cascadeOnDelete();
            $table->foreignId('account_id')->constrained('accounts')->cascadeOnDelete();
            $table->foreignId('support_ticket_id')->nullable()->constrained('support_tickets')->nullOnDelete();
            $table->foreignId('support_ticket_message_id')->nullable()->constrained('support_ticket_messages')->nullOnDelete();
            $table->string('requester_role', 50);
            $table->string('delivery_type', 50)->default('scheduled')->index();
            $table->string('status', 50)->index();
            $table->string('skip_reason', 120)->nullable();
            $table->text('error_message')->nullable();
            $table->unsignedTinyInteger('retry_count')->default(0);
            $table->date('scheduled_for_date')->nullable()->index();
            $table->timestamp('attempted_at')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->json('scenario_snapshot')->nullable();
            $table->json('target_snapshot')->nullable();
            $table->timestamps();

            $table->index(['support_step_scenario_id', 'account_id', 'delivery_type', 'status'], 'ssd_scenario_account_type_status_idx');
            $table->index(['account_id', 'scheduled_for_date', 'status'], 'ssd_account_date_status_idx');
            $table->index(['status', 'retry_count', 'attempted_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('support_step_deliveries');
    }
};
