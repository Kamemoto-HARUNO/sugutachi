<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('booking_consents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->constrained('bookings')->cascadeOnDelete();
            $table->foreignId('account_id')->constrained('accounts')->restrictOnDelete();
            $table->string('consent_type', 100);
            $table->foreignId('legal_document_id')->nullable()->constrained('legal_documents')->nullOnDelete();
            $table->timestamp('consented_at');
            $table->string('ip_hash', 64)->nullable();
            $table->timestamps();

            $table->unique(['booking_id', 'account_id', 'consent_type']);
            $table->index(['account_id', 'consented_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_consents');
    }
};
