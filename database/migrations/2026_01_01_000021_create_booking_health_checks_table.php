<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('booking_health_checks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->constrained('bookings')->cascadeOnDelete();
            $table->foreignId('account_id')->constrained('accounts')->restrictOnDelete();
            $table->string('role', 50);
            $table->string('drinking_status', 50)->nullable();
            $table->boolean('has_injury')->nullable();
            $table->boolean('has_fever')->nullable();
            $table->json('contraindications_json')->nullable();
            $table->text('notes_encrypted')->nullable();
            $table->timestamp('checked_at');
            $table->timestamps();

            $table->index(['booking_id', 'role']);
            $table->index(['account_id', 'checked_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_health_checks');
    }
};
