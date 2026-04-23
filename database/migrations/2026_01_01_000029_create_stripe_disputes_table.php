<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stripe_disputes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->nullable()->constrained('bookings')->nullOnDelete();
            $table->foreignId('payment_intent_id')->nullable()->constrained('payment_intents')->nullOnDelete();
            $table->string('stripe_dispute_id')->unique();
            $table->string('status', 50);
            $table->string('reason', 100)->nullable();
            $table->unsignedInteger('amount');
            $table->string('currency', 3)->default('jpy');
            $table->timestamp('evidence_due_by')->nullable();
            $table->string('outcome', 50)->nullable();
            $table->string('last_stripe_event_id')->nullable();
            $table->timestamps();

            $table->index('booking_id');
            $table->index(['status', 'evidence_due_by']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stripe_disputes');
    }
};
