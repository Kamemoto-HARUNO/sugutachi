<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('campaign_applications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('campaign_id')->constrained('campaigns')->cascadeOnDelete();
            $table->foreignId('account_id')->constrained('accounts')->cascadeOnDelete();
            $table->foreignId('booking_id')->nullable()->constrained('bookings')->nullOnDelete();
            $table->foreignId('therapist_ledger_entry_id')->nullable()->constrained('therapist_ledger_entries')->nullOnDelete();
            $table->string('application_key', 191)->unique();
            $table->string('status', 50);
            $table->string('benefit_type', 50);
            $table->unsignedInteger('benefit_value');
            $table->unsignedInteger('applied_amount');
            $table->timestamp('applied_at')->nullable();
            $table->timestamp('offer_expires_at')->nullable();
            $table->timestamp('consumed_at')->nullable();
            $table->json('metadata_json')->nullable();
            $table->timestamps();

            $table->index(['campaign_id', 'status']);
            $table->index(['account_id', 'status']);
            $table->index('booking_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('campaign_applications');
    }
};
