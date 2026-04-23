<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('therapist_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('account_id')->unique()->constrained('accounts')->restrictOnDelete();
            $table->string('public_id', 36)->unique();
            $table->string('public_name', 80);
            $table->text('bio')->nullable();
            $table->string('profile_status', 50)->default('draft');
            $table->string('training_status', 50)->default('none');
            $table->string('photo_review_status', 50)->default('pending');
            $table->boolean('is_online')->default(false);
            $table->timestamp('online_since')->nullable();
            $table->timestamp('last_location_updated_at')->nullable();
            $table->decimal('rating_average', 3, 2)->default(0);
            $table->unsignedInteger('review_count')->default(0);
            $table->timestamp('approved_at')->nullable();
            $table->foreignId('approved_by_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->string('rejected_reason_code', 100)->nullable();
            $table->timestamps();

            $table->index(['profile_status', 'is_online']);
            $table->index('training_status');
            $table->index('rating_average');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('therapist_profiles');
    }
};
