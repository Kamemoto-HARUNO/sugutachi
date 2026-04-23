<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->constrained('bookings')->cascadeOnDelete();
            $table->foreignId('reviewer_account_id')->constrained('accounts')->restrictOnDelete();
            $table->foreignId('reviewee_account_id')->constrained('accounts')->restrictOnDelete();
            $table->string('reviewer_role', 50);
            $table->unsignedTinyInteger('rating_overall');
            $table->unsignedTinyInteger('rating_manners')->nullable();
            $table->unsignedTinyInteger('rating_skill')->nullable();
            $table->unsignedTinyInteger('rating_cleanliness')->nullable();
            $table->unsignedTinyInteger('rating_safety')->nullable();
            $table->text('public_comment')->nullable();
            $table->text('private_feedback_encrypted')->nullable();
            $table->string('status', 50)->default('visible');
            $table->foreignId('moderated_by_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->timestamp('moderated_at')->nullable();
            $table->timestamps();

            $table->unique(['booking_id', 'reviewer_account_id']);
            $table->index(['reviewee_account_id', 'status', 'created_at']);
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reviews');
    }
};
