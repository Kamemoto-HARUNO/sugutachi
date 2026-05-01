<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('accounts', function (Blueprint $table): void {
            $table->timestamp('withdrawn_at')->nullable()->after('suspension_reason');
            $table->string('withdrawal_reason_code', 100)->nullable()->after('withdrawn_at');
        });
    }

    public function down(): void
    {
        Schema::table('accounts', function (Blueprint $table): void {
            $table->dropColumn([
                'withdrawn_at',
                'withdrawal_reason_code',
            ]);
        });
    }
};
