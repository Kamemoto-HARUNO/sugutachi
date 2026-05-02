<?php

use Carbon\CarbonImmutable;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('banners')) {
            return;
        }

        if ($this->driverName() !== 'sqlite') {
            DB::statement('ALTER TABLE banners MODIFY starts_at DATETIME NOT NULL, MODIFY ends_at DATETIME NULL');
        }

        $snapshotsByPublicId = $this->latestBannerSnapshots();

        $banners = DB::table('banners')->get(['id', 'public_id', 'starts_at', 'ends_at']);

        foreach ($banners as $banner) {
            $snapshot = $snapshotsByPublicId[$banner->public_id] ?? null;

            DB::table('banners')
                ->where('id', $banner->id)
                ->update([
                    'starts_at' => $this->resolveNormalizedDateTime(
                        $snapshot['starts_at'] ?? null,
                        $banner->starts_at,
                    ),
                    'ends_at' => $this->resolveNormalizedDateTime(
                        $snapshot['ends_at'] ?? null,
                        $banner->ends_at,
                    ),
                ]);
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('banners')) {
            return;
        }

        $banners = DB::table('banners')->get(['id', 'starts_at', 'ends_at']);

        foreach ($banners as $banner) {
            DB::table('banners')
                ->where('id', $banner->id)
                ->update([
                    'starts_at' => $this->shiftDateTime($banner->starts_at, 9),
                    'ends_at' => $this->shiftDateTime($banner->ends_at, 9),
                ]);
        }

        if ($this->driverName() !== 'sqlite') {
            DB::statement('ALTER TABLE banners MODIFY starts_at TIMESTAMP NOT NULL, MODIFY ends_at TIMESTAMP NULL');
        }
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private function latestBannerSnapshots(): array
    {
        if (! Schema::hasTable('admin_audit_logs')) {
            return [];
        }

        $snapshots = [];

        foreach (
            DB::table('admin_audit_logs')
                ->whereIn('action', ['banner.create', 'banner.update'])
                ->orderBy('id')
                ->cursor() as $log
        ) {
            $after = json_decode((string) $log->after_json, true);

            if (! is_array($after)) {
                continue;
            }

            $publicId = $after['public_id'] ?? null;

            if (! is_string($publicId) || $publicId === '') {
                continue;
            }

            $snapshots[$publicId] = $after;
        }

        return $snapshots;
    }

    private function resolveNormalizedDateTime(mixed $snapshotValue, mixed $currentValue): ?string
    {
        if (is_string($snapshotValue) && $snapshotValue !== '') {
            return CarbonImmutable::parse($snapshotValue)
                ->utc()
                ->format('Y-m-d H:i:s');
        }

        if (is_string($currentValue) && $currentValue !== '') {
            return CarbonImmutable::parse($currentValue, 'UTC')
                ->subHours(9)
                ->format('Y-m-d H:i:s');
        }

        return null;
    }

    private function shiftDateTime(mixed $value, int $hours): ?string
    {
        if (! is_string($value) || $value === '') {
            return null;
        }

        return CarbonImmutable::parse($value, 'UTC')
            ->addHours($hours)
            ->format('Y-m-d H:i:s');
    }

    private function driverName(): string
    {
        return DB::connection()->getDriverName();
    }
};
