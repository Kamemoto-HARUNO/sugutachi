<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payout_requests', function (Blueprint $table) {
            $table->id();
            $table->string('public_id', 36)->unique();
            $table->foreignId('therapist_account_id')->constrained('accounts')->restrictOnDelete();
            $table->foreignId('stripe_connected_account_id')->constrained('stripe_connected_accounts')->restrictOnDelete();
            $table->string('status', 50)->default('payout_requested');
            $table->unsignedInteger('requested_amount');
            $table->unsignedInteger('fee_amount')->default(0);
            $table->unsignedInteger('net_amount');
            $table->timestamp('requested_at');
            $table->date('scheduled_process_date');
            $table->timestamp('processed_at')->nullable();
            $table->string('stripe_payout_id')->nullable();
            $table->text('failure_reason')->nullable();
            $table->foreignId('reviewed_by_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->timestamps();

            $table->index(['therapist_account_id', 'status']);
            $table->index(['scheduled_process_date', 'status']);
            $table->index('stripe_payout_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payout_requests');
    }
};
