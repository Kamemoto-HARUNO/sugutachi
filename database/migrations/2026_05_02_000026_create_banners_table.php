<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('banners', function (Blueprint $table): void {
            $table->id();
            $table->string('public_id')->unique();
            $table->string('title');
            $table->text('link_url');
            $table->string('image_path');
            $table->string('image_original_name')->nullable();
            $table->string('image_mime_type', 120)->nullable();
            $table->unsignedBigInteger('image_size_bytes')->nullable();
            $table->json('placements');
            $table->json('viewer_segments');
            $table->string('status', 20)->default('draft');
            $table->unsignedInteger('sort_order')->default(100);
            $table->timestamp('starts_at');
            $table->timestamp('ends_at')->nullable();
            $table->unsignedBigInteger('impression_count')->default(0);
            $table->unsignedBigInteger('click_count')->default(0);
            $table->foreignId('created_by_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->foreignId('updated_by_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->timestamps();

            $table->index(['status', 'sort_order']);
            $table->index('starts_at');
            $table->index('ends_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('banners');
    }
};
