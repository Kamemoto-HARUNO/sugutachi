<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('account_id')->unique()->constrained('accounts')->restrictOnDelete();
            $table->string('profile_status', 50)->default('incomplete')->index();
            $table->string('age_range', 50)->nullable();
            $table->string('body_type', 50)->nullable();
            $table->unsignedSmallInteger('height_cm')->nullable();
            $table->string('weight_range', 50)->nullable();
            $table->json('preferences_json')->nullable();
            $table->json('touch_ng_json')->nullable();
            $table->text('health_notes_encrypted')->nullable();
            $table->string('sexual_orientation', 50)->nullable();
            $table->string('gender_identity', 50)->nullable();
            $table->boolean('disclose_sensitive_profile_to_therapist')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_profiles');
    }
};
