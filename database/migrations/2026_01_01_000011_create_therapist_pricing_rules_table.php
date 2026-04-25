<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('therapist_pricing_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('therapist_profile_id')->constrained('therapist_profiles')->cascadeOnDelete();
            $table->foreignId('therapist_menu_id')->nullable()->constrained('therapist_menus')->cascadeOnDelete();
            $table->string('rule_type', 50);
            $table->json('condition_json')->nullable();
            $table->string('adjustment_type', 50);
            $table->integer('adjustment_amount');
            $table->unsignedInteger('min_price_amount')->nullable();
            $table->unsignedInteger('max_price_amount')->nullable();
            $table->unsignedInteger('priority')->default(100);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['therapist_profile_id', 'is_active', 'priority'], 'tpr_profile_active_priority_idx');
            $table->index(['therapist_menu_id', 'is_active'], 'tpr_menu_active_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('therapist_pricing_rules');
    }
};
