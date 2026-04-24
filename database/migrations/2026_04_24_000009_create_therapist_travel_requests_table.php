<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('therapist_travel_requests', function (Blueprint $table): void {
            $table->id();
            $table->string('public_id', 36)->unique();
            $table->foreignId('user_account_id')->constrained('accounts')->cascadeOnDelete();
            $table->foreignId('therapist_account_id')->constrained('accounts')->cascadeOnDelete();
            $table->foreignId('therapist_profile_id')->constrained('therapist_profiles')->cascadeOnDelete();
            $table->string('prefecture', 50);
            $table->text('message_encrypted');
            $table->boolean('detected_contact_exchange')->default(false);
            $table->string('status', 50)->default('unread');
            $table->timestamp('read_at')->nullable();
            $table->timestamp('archived_at')->nullable();
            $table->timestamps();

            $table->index(['therapist_account_id', 'status', 'created_at']);
            $table->index(['therapist_profile_id', 'status', 'created_at']);
            $table->index(['user_account_id', 'created_at']);
            $table->index(['prefecture', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('therapist_travel_requests');
    }
};
