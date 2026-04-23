<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('identity_verifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('account_id')->constrained('accounts')->restrictOnDelete();
            $table->string('provider', 50)->default('manual');
            $table->string('provider_reference_id')->nullable();
            $table->string('status', 50)->default('pending')->index();
            $table->text('full_name_encrypted')->nullable();
            $table->text('birthdate_encrypted')->nullable();
            $table->unsignedSmallInteger('birth_year')->nullable();
            $table->boolean('is_age_verified')->default(false)->index();
            $table->boolean('self_declared_male')->default(false);
            $table->string('document_type', 50)->nullable();
            $table->string('document_last4_hash', 64)->nullable();
            $table->text('document_storage_key_encrypted')->nullable();
            $table->text('selfie_storage_key_encrypted')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->foreignId('reviewed_by_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->string('rejection_reason_code', 100)->nullable();
            $table->timestamp('purge_after')->nullable();
            $table->timestamps();

            $table->index(['account_id', 'status']);
            $table->index(['status', 'submitted_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('identity_verifications');
    }
};
