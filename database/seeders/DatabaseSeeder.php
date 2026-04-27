<?php

namespace Database\Seeders;

use App\Services\Legal\DefaultLegalDocumentService;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function __construct(
        private readonly DefaultLegalDocumentService $defaultLegalDocumentService,
    ) {}

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->defaultLegalDocumentService->ensurePublished(['terms', 'privacy', 'commerce']);

        if (app()->environment('local')) {
            $this->call(AdminSeeder::class);
            $this->call(LocalPreviewSeeder::class);
        }
    }
}
