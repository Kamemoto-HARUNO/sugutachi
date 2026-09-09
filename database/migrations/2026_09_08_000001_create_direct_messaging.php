<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_profiles', function (Blueprint $table) {
            $table->string('public_id', 36)->nullable()->unique();
        });
        DB::table('user_profiles')->orderBy('id')->chunkById(200, function ($profiles) {
            foreach ($profiles as $profile) {
                DB::table('user_profiles')->where('id', $profile->id)->update(['public_id' => 'usp_'.Str::ulid()]);
            }
        });
        Schema::table('therapist_profiles', fn (Blueprint $table) => $table->boolean('consultation_enabled')->default(false));
        Schema::create('role_relationships', function (Blueprint $table) {
            $table->id();
            $table->string('public_id', 36)->unique();
            $table->foreignId('user_account_id')->constrained('accounts')->restrictOnDelete();
            $table->foreignId('therapist_account_id')->constrained('accounts')->restrictOnDelete();
            $table->timestamp('user_blocked_at')->nullable();
            $table->timestamp('therapist_blocked_at')->nullable();
            $table->timestamps();
            $table->unique(['user_account_id', 'therapist_account_id'], 'role_relationship_pair');
        });
        Schema::create('direct_message_threads', function (Blueprint $table) {
            $table->id();
            $table->string('public_id', 36)->unique();
            $table->foreignId('relationship_id')->unique()->constrained('role_relationships')->restrictOnDelete();
            $table->foreignId('user_profile_id')->constrained()->restrictOnDelete();
            $table->foreignId('therapist_profile_id')->constrained()->restrictOnDelete();
            foreach (['user', 'therapist'] as $role) {
                $table->boolean($role.'_muted')->default(false);
                $table->boolean($role.'_archived')->default(false);
                $table->boolean($role.'_paused')->default(false);
            }
            $table->timestamp('last_message_at')->nullable()->index();
            $table->timestamp('first_reply_at')->nullable();
            $table->timestamps();
            $table->unique(['user_profile_id', 'therapist_profile_id'], 'dm_profile_pair');
        });
        Schema::create('direct_messages', function (Blueprint $table) {
            $table->id();
            $table->string('public_id', 36)->unique();
            $table->foreignId('thread_id')->constrained('direct_message_threads')->restrictOnDelete();
            $table->string('sender_role', 20);
            $table->string('client_message_id', 64);
            $table->string('content_hash', 64);
            $table->string('message_type', 20);
            $table->text('body_encrypted')->nullable();
            $table->text('attachment_key')->nullable();
            $table->string('attachment_mime', 50)->nullable();
            $table->unsignedInteger('attachment_size')->nullable();
            $table->dateTime('sent_at')->index();
            $table->timestamp('read_at')->nullable();
            $table->dateTime('expires_at')->index();
            $table->timestamp('deleted_at')->nullable();
            $table->timestamps();
            $table->unique(['thread_id', 'sender_role', 'client_message_id'], 'dm_send_key');
            $table->index(['thread_id', 'id']);
            $table->index(['thread_id', 'sender_role', 'read_at']);
        });
        Schema::create('direct_message_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('account_id')->constrained()->restrictOnDelete();
            $table->string('role', 20);
            $table->boolean('email_enabled')->default(true);
            $table->boolean('push_enabled')->default(true);
            $table->timestamps();
            $table->unique(['account_id', 'role']);
        });
        Schema::create('direct_message_deliveries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('thread_id')->constrained('direct_message_threads')->restrictOnDelete();
            $table->foreignId('message_id')->constrained('direct_messages')->restrictOnDelete();
            $table->string('recipient_role', 20);
            $table->string('channel', 20);
            $table->string('status', 20)->default('pending');
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->dateTime('due_at')->index();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();
            $table->unique(['message_id', 'channel']);
        });
        Schema::table('reports', function (Blueprint $table) {
            $table->foreignId('direct_message_thread_id')->nullable()->constrained('direct_message_threads')->restrictOnDelete();
            $table->foreignId('source_direct_message_id')->nullable()->constrained('direct_messages')->restrictOnDelete();
            $table->string('reporter_role', 20)->nullable();
            $table->text('dm_evidence_encrypted')->nullable();
            $table->text('dm_evidence_attachment')->nullable();
            $table->timestamp('evidence_review_at')->nullable();
            $table->timestamp('evidence_expires_at')->nullable();
        });
        Schema::create('dm_system_deliveries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('notification_id')->constrained('notifications')->restrictOnDelete();
            $table->string('channel', 20);
            $table->string('status', 20)->default('pending');
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->dateTime('due_at');
            $table->unique(['notification_id', 'channel']);
        });
        Schema::create('dm_deletions', function (Blueprint $table) {
            $table->id();
            $table->string('subject_type', 20);
            $table->string('subject_public_id', 36);
            $table->dateTime('deleted_at');
            $table->unique(['subject_type', 'subject_public_id']);
        });
        Schema::create('block_booking_actions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('relationship_id')->constrained('role_relationships')->restrictOnDelete();
            $table->foreignId('booking_id')->unique()->constrained()->restrictOnDelete();
            $table->string('status', 30)->default('pending');
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->timestamp('due_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dm_system_deliveries');
        Schema::dropIfExists('dm_deletions');
        Schema::dropIfExists('block_booking_actions');
        Schema::table('reports', function (Blueprint $table) {
            $table->dropConstrainedForeignId('direct_message_thread_id');
            $table->dropConstrainedForeignId('source_direct_message_id');
            $table->dropColumn(['reporter_role', 'dm_evidence_encrypted', 'dm_evidence_attachment', 'evidence_review_at', 'evidence_expires_at']);
        });
        Schema::dropIfExists('direct_message_deliveries');
        Schema::dropIfExists('direct_message_settings');
        Schema::dropIfExists('direct_messages');
        Schema::dropIfExists('direct_message_threads');
        Schema::dropIfExists('role_relationships');
        Schema::table('therapist_profiles', fn (Blueprint $table) => $table->dropColumn('consultation_enabled'));
        Schema::table('user_profiles', function (Blueprint $table) {
            $table->dropUnique(['public_id']);
            $table->dropColumn('public_id');
        });
    }
};
