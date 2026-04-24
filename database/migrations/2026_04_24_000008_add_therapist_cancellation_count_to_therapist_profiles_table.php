<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('therapist_profiles', function (Blueprint $table): void {
            $table->unsignedInteger('therapist_cancellation_count')
                ->default(0)
                ->after('review_count');
        });
    }

    public function down(): void
    {
        Schema::table('therapist_profiles', function (Blueprint $table): void {
            $table->dropColumn('therapist_cancellation_count');
        });
    }
};
