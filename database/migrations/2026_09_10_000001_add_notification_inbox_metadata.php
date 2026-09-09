<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->string('audience_role', 16)->nullable();
            $table->string('conversation_key', 120)->nullable();
            $table->index(['account_id', 'audience_role', 'read_at'], 'notifications_inbox_scope');
            $table->index(['account_id', 'conversation_key', 'id'], 'notifications_conversation');
        });
    }

    public function down(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->dropIndex('notifications_inbox_scope');
            $table->dropIndex('notifications_conversation');
            $table->dropColumn(['audience_role', 'conversation_key']);
        });
    }
};
