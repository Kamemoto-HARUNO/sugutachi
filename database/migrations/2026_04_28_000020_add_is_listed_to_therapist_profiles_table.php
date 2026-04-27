<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('therapist_profiles', function (Blueprint $table): void {
            $table->boolean('is_listed')->default(true)->after('is_online');
        });

        DB::table('therapist_profiles')->update([
            'is_listed' => true,
        ]);
    }

    public function down(): void
    {
        Schema::table('therapist_profiles', function (Blueprint $table): void {
            $table->dropColumn('is_listed');
        });
    }
};
