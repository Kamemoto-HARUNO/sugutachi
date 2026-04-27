<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('therapist_profiles', function (Blueprint $table): void {
            $table->unsignedSmallInteger('height_cm')->nullable()->after('bio');
            $table->unsignedSmallInteger('weight_kg')->nullable()->after('height_cm');
            $table->unsignedSmallInteger('p_size_cm')->nullable()->after('weight_kg');
        });
    }

    public function down(): void
    {
        Schema::table('therapist_profiles', function (Blueprint $table): void {
            $table->dropColumn(['height_cm', 'weight_kg', 'p_size_cm']);
        });
    }
};
