<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('favorite_event_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->foreignId('therapist_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->foreignId('therapist_profile_id')->nullable()->constrained('therapist_profiles')->nullOnDelete();
            $table->string('event_type', 80);
            $table->json('metadata_json')->nullable();
            $table->timestamps();

            $table->index(['event_type', 'created_at']);
            $table->index(['therapist_profile_id', 'event_type', 'created_at'], 'favorite_events_profile_type_created_index');
            $table->index(['user_account_id', 'event_type', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('favorite_event_logs');
    }
};
