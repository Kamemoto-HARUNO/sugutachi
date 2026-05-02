<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('therapist_menus', function (Blueprint $table): void {
            $table->boolean('is_free')->default(false)->after('base_price_amount');
        });
    }

    public function down(): void
    {
        Schema::table('therapist_menus', function (Blueprint $table): void {
            $table->dropColumn('is_free');
        });
    }
};
