<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('refunds', function (Blueprint $table) {
            $table->id();
            $table->string('public_id', 36)->unique();
            $table->foreignId('booking_id')->constrained('bookings')->restrictOnDelete();
            $table->foreignId('payment_intent_id')->nullable()->constrained('payment_intents')->nullOnDelete();
            $table->foreignId('requested_by_account_id')->constrained('accounts')->restrictOnDelete();
            $table->string('status', 50)->default('requested');
            $table->string('reason_code', 100);
            $table->text('detail_encrypted')->nullable();
            $table->unsignedInteger('requested_amount')->nullable();
            $table->unsignedInteger('approved_amount')->nullable();
            $table->string('stripe_refund_id')->nullable();
            $table->foreignId('reviewed_by_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();

            $table->index(['booking_id', 'status']);
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('refunds');
    }
};
