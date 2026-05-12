<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_profiles', function (Blueprint $table) {
            $table->boolean('favorite_notify_online')->default(true)->after('disclose_sensitive_profile_to_therapist');
            $table->boolean('favorite_notify_availability')->default(true)->after('favorite_notify_online');
            $table->boolean('favorite_email_notifications_enabled')->default(true)->after('favorite_notify_availability');
        });
    }

    public function down(): void
    {
        Schema::table('user_profiles', function (Blueprint $table) {
            $table->dropColumn([
                'favorite_notify_online',
                'favorite_notify_availability',
                'favorite_email_notifications_enabled',
            ]);
        });
    }
};
