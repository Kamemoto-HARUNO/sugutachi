<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('therapist_favorites', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_account_id')->constrained('accounts')->cascadeOnDelete();
            $table->foreignId('therapist_account_id')->constrained('accounts')->cascadeOnDelete();
            $table->foreignId('therapist_profile_id')->constrained('therapist_profiles')->cascadeOnDelete();
            $table->timestamp('last_action_at')->nullable();
            $table->timestamp('last_online_notified_at')->nullable();
            $table->timestamp('last_availability_notified_at')->nullable();
            $table->timestamps();

            $table->unique(['user_account_id', 'therapist_profile_id'], 'therapist_favorites_user_profile_unique');
            $table->index(['therapist_profile_id', 'created_at']);
            $table->index(['user_account_id', 'created_at']);
            $table->index(['therapist_account_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('therapist_favorites');
    }
};
