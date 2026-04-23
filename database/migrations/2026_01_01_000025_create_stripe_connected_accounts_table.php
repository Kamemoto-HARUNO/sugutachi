<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stripe_connected_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('account_id')->unique()->constrained('accounts')->restrictOnDelete();
            $table->foreignId('therapist_profile_id')->constrained('therapist_profiles')->restrictOnDelete();
            $table->string('stripe_account_id')->unique();
            $table->string('account_type', 50)->default('express');
            $table->string('status', 50)->default('pending');
            $table->boolean('charges_enabled')->default(false);
            $table->boolean('payouts_enabled')->default(false);
            $table->boolean('details_submitted')->default(false);
            $table->json('requirements_currently_due_json')->nullable();
            $table->json('requirements_past_due_json')->nullable();
            $table->string('disabled_reason')->nullable();
            $table->timestamp('onboarding_completed_at')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'payouts_enabled']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stripe_connected_accounts');
    }
};
