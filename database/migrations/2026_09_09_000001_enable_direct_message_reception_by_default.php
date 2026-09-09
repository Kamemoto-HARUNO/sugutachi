<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Existing choices remain unchanged; only newly created profiles default to on.
        Schema::table('therapist_profiles', fn (Blueprint $table) => $table->boolean('consultation_enabled')->default(true)->change());
    }

    public function down(): void
    {
        Schema::table('therapist_profiles', fn (Blueprint $table) => $table->boolean('consultation_enabled')->default(false)->change());
    }
};
