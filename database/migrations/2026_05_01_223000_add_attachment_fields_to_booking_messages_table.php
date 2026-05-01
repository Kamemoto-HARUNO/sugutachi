<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('booking_messages', function (Blueprint $table) {
            $table->text('attachment_storage_key_encrypted')->nullable()->after('body_encrypted');
            $table->string('attachment_original_name')->nullable()->after('attachment_storage_key_encrypted');
            $table->string('attachment_mime_type', 120)->nullable()->after('attachment_original_name');
            $table->unsignedBigInteger('attachment_size_bytes')->nullable()->after('attachment_mime_type');
        });
    }

    public function down(): void
    {
        Schema::table('booking_messages', function (Blueprint $table) {
            $table->dropColumn([
                'attachment_storage_key_encrypted',
                'attachment_original_name',
                'attachment_mime_type',
                'attachment_size_bytes',
            ]);
        });
    }
};
