<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('private_photo_view_sessions', function (Blueprint $table): void {
            $table->id();
            $table->string('session_token', 64)->unique();
            $table->foreignId('viewer_account_id')->constrained('accounts')->restrictOnDelete();
            $table->foreignId('therapist_profile_id')->constrained('therapist_profiles')->cascadeOnDelete();
            $table->unsignedTinyInteger('photo_count')->default(0);
            $table->string('watermark_label', 120);
            $table->timestamp('opened_at');
            $table->timestamp('display_started_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('locked_until')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->string('close_reason', 50)->nullable();
            $table->string('ip_hash', 64)->nullable();
            $table->text('user_agent')->nullable();
            $table->timestamps();

            $table->index(['viewer_account_id', 'therapist_profile_id', 'opened_at'], 'private_photo_view_sessions_viewer_profile_opened_index');
            $table->index(['therapist_profile_id', 'locked_until'], 'private_photo_view_sessions_profile_locked_until_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('private_photo_view_sessions');
    }
};
