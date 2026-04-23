<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bookings', function (Blueprint $table) {
            $table->id();
            $table->string('public_id', 36)->unique();
            $table->foreignId('user_account_id')->constrained('accounts')->restrictOnDelete();
            $table->foreignId('therapist_account_id')->constrained('accounts')->restrictOnDelete();
            $table->foreignId('therapist_profile_id')->constrained('therapist_profiles')->restrictOnDelete();
            $table->foreignId('therapist_menu_id')->constrained('therapist_menus')->restrictOnDelete();
            $table->foreignId('service_address_id')->constrained('service_addresses')->restrictOnDelete();
            $table->string('status', 50)->index();
            $table->boolean('is_on_demand')->default(true);
            $table->timestamp('requested_start_at')->nullable();
            $table->timestamp('scheduled_start_at')->nullable();
            $table->timestamp('scheduled_end_at')->nullable();
            $table->unsignedInteger('duration_minutes');
            $table->timestamp('request_expires_at')->nullable();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('confirmed_at')->nullable();
            $table->timestamp('moving_at')->nullable();
            $table->timestamp('arrived_at')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->timestamp('canceled_at')->nullable();
            $table->foreignId('canceled_by_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->string('cancel_reason_code', 100)->nullable();
            $table->timestamp('interrupted_at')->nullable();
            $table->string('interruption_reason_code', 100)->nullable();
            $table->unsignedInteger('total_amount')->default(0);
            $table->unsignedInteger('therapist_net_amount')->default(0);
            $table->unsignedInteger('platform_fee_amount')->default(0);
            $table->unsignedInteger('matching_fee_amount')->default(0);
            $table->json('user_snapshot_json')->nullable();
            $table->json('therapist_snapshot_json')->nullable();
            $table->timestamps();

            $table->index(['user_account_id', 'status', 'scheduled_start_at']);
            $table->index(['therapist_account_id', 'status', 'scheduled_start_at']);
            $table->index(['therapist_profile_id', 'status']);
            $table->index(['status', 'request_expires_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bookings');
    }
};
