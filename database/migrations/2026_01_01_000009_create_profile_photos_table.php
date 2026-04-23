<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('profile_photos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('account_id')->constrained('accounts')->restrictOnDelete();
            $table->foreignId('therapist_profile_id')->nullable()->constrained('therapist_profiles')->cascadeOnDelete();
            $table->string('usage_type', 50);
            $table->text('storage_key_encrypted');
            $table->string('content_hash', 64)->nullable();
            $table->string('status', 50)->default('pending');
            $table->string('rejection_reason_code', 100)->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->foreignId('reviewed_by_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();

            $table->index(['account_id', 'usage_type']);
            $table->index(['therapist_profile_id', 'status', 'sort_order']);
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('profile_photos');
    }
};
