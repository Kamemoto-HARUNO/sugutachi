<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admin_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('author_account_id')->constrained('accounts')->restrictOnDelete();
            $table->string('target_type', 100);
            $table->unsignedBigInteger('target_id');
            $table->text('note_encrypted');
            $table->timestamps();

            $table->index(['target_type', 'target_id']);
            $table->index(['author_account_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_notes');
    }
};
