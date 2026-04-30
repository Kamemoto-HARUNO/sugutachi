<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('campaigns', function (Blueprint $table) {
            $table->id();
            $table->string('target_role', 50);
            $table->string('trigger_type', 50);
            $table->string('benefit_type', 50);
            $table->unsignedInteger('benefit_value');
            $table->text('offer_text');
            $table->timestamp('starts_at');
            $table->timestamp('ends_at')->nullable();
            $table->unsignedInteger('offer_valid_days')->nullable();
            $table->boolean('is_enabled')->default(true);
            $table->foreignId('created_by_account_id')->constrained('accounts')->restrictOnDelete();
            $table->foreignId('updated_by_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->timestamps();

            $table->index(['target_role', 'trigger_type', 'is_enabled']);
            $table->index(['starts_at', 'ends_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('campaigns');
    }
};
