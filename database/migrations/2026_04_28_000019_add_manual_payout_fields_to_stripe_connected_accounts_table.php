<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stripe_connected_accounts', function (Blueprint $table) {
            $table->string('payout_method', 50)
                ->default('stripe_connect')
                ->after('account_type');
            $table->string('bank_name')->nullable()->after('payout_method');
            $table->string('bank_branch_name')->nullable()->after('bank_name');
            $table->string('bank_account_type', 20)->nullable()->after('bank_branch_name');
            $table->text('bank_account_number')->nullable()->after('bank_account_type');
            $table->text('bank_account_holder_name')->nullable()->after('bank_account_number');

            $table->index(['payout_method', 'status'], 'stripe_connected_accounts_payout_method_status_idx');
        });
    }

    public function down(): void
    {
        Schema::table('stripe_connected_accounts', function (Blueprint $table) {
            $table->dropIndex('stripe_connected_accounts_payout_method_status_idx');
            $table->dropColumn([
                'payout_method',
                'bank_name',
                'bank_branch_name',
                'bank_account_type',
                'bank_account_number',
                'bank_account_holder_name',
            ]);
        });
    }
};
