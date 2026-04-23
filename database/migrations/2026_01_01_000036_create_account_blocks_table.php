<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('account_blocks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('blocker_account_id')->constrained('accounts')->cascadeOnDelete();
            $table->foreignId('blocked_account_id')->constrained('accounts')->cascadeOnDelete();
            $table->string('reason_code', 100)->nullable();
            $table->timestamps();

            $table->unique(['blocker_account_id', 'blocked_account_id']);
            $table->index('blocked_account_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('account_blocks');
    }
};
