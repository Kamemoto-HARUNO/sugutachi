<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_intents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->constrained('bookings')->restrictOnDelete();
            $table->foreignId('payer_account_id')->constrained('accounts')->restrictOnDelete();
            $table->string('stripe_payment_intent_id')->unique();
            $table->string('stripe_customer_id')->nullable();
            $table->foreignId('stripe_connected_account_id')->nullable()->constrained('stripe_connected_accounts')->nullOnDelete();
            $table->string('status', 50);
            $table->string('capture_method', 50)->default('manual');
            $table->string('currency', 3)->default('jpy');
            $table->unsignedInteger('amount');
            $table->unsignedInteger('application_fee_amount')->default(0);
            $table->unsignedInteger('transfer_amount')->default(0);
            $table->boolean('is_current')->default(true);
            $table->timestamp('authorized_at')->nullable();
            $table->timestamp('captured_at')->nullable();
            $table->timestamp('canceled_at')->nullable();
            $table->string('last_stripe_event_id')->nullable();
            $table->json('metadata_json')->nullable();
            $table->timestamps();

            $table->index(['booking_id', 'is_current']);
            $table->index(['payer_account_id', 'created_at']);
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_intents');
    }
};
