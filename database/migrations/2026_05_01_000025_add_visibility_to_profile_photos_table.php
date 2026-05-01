<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('profile_photos', function (Blueprint $table): void {
            $table->string('visibility', 20)
                ->default('public')
                ->after('usage_type');

            $table->index(
                ['therapist_profile_id', 'visibility', 'status', 'sort_order'],
                'profile_photos_profile_visibility_status_sort_index',
            );
        });
    }

    public function down(): void
    {
        Schema::table('profile_photos', function (Blueprint $table): void {
            $table->dropIndex('profile_photos_profile_visibility_status_sort_index');
            $table->dropColumn('visibility');
        });
    }
};
