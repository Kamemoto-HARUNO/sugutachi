<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('therapist_ledger_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('therapist_account_id')->constrained('accounts')->restrictOnDelete();
            $table->foreignId('booking_id')->nullable()->constrained('bookings')->nullOnDelete();
            $table->foreignId('payout_request_id')->nullable()->constrained('payout_requests')->nullOnDelete();
            $table->string('entry_type', 50);
            $table->integer('amount_signed');
            $table->string('status', 50);
            $table->timestamp('available_at')->nullable();
            $table->string('description')->nullable();
            $table->json('metadata_json')->nullable();
            $table->timestamps();

            $table->index(['therapist_account_id', 'status']);
            $table->index('booking_id');
            $table->index('payout_request_id');
            $table->index('available_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('therapist_ledger_entries');
    }
};
