<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('blog_posts', function (Blueprint $table): void {
            $table->unsignedBigInteger('view_count')->default(0)->after('noindex');
            $table->unsignedBigInteger('search_view_count')->default(0)->after('view_count');
            $table->unsignedBigInteger('internal_view_count')->default(0)->after('search_view_count');
            $table->unsignedBigInteger('external_view_count')->default(0)->after('internal_view_count');
            $table->unsignedBigInteger('direct_view_count')->default(0)->after('external_view_count');
        });
    }

    public function down(): void
    {
        Schema::table('blog_posts', function (Blueprint $table): void {
            $table->dropColumn([
                'view_count',
                'search_view_count',
                'internal_view_count',
                'external_view_count',
                'direct_view_count',
            ]);
        });
    }
};
