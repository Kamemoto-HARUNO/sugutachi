<?php

namespace App\Models;

use App\Models\Concerns\UsesPublicIdRouteKey;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
#[Guarded(['id'])]
class Banner extends Model
{
    use UsesPublicIdRouteKey;

    public const PLACEMENT_HOME = 'home';

    public const PLACEMENT_THERAPIST_DETAIL = 'therapist_detail';

    public const PLACEMENT_DASHBOARD = 'dashboard';

    public const VIEWER_SEGMENT_GUEST = 'guest';

    public const VIEWER_SEGMENT_USER = 'user';

    public const VIEWER_SEGMENT_THERAPIST = 'therapist';

    public const STATUS_DRAFT = 'draft';

    public const STATUS_HIDDEN = 'hidden';

    public const STATUS_PUBLISHED = 'published';

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'created_by_account_id');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'updated_by_account_id');
    }

    public function scopePublished($query)
    {
        return $query->where('status', self::STATUS_PUBLISHED);
    }

    public function scopeActiveAt($query, CarbonInterface $at)
    {
        return $query
            ->where('starts_at', '<=', $at)
            ->where(function ($builder) use ($at): void {
                $builder
                    ->whereNull('ends_at')
                    ->orWhere('ends_at', '>=', $at);
            });
    }

    public function scopeForPlacement($query, string $placement)
    {
        return $query->whereJsonContains('placements', $placement);
    }

    public function scopeForViewerSegments($query, array $viewerSegments)
    {
        $viewerSegments = array_values(array_unique($viewerSegments));

        if ($viewerSegments === []) {
            return $query->whereRaw('1 = 0');
        }

        return $query->where(function ($builder) use ($viewerSegments): void {
            foreach ($viewerSegments as $viewerSegment) {
                $builder->orWhereJsonContains('viewer_segments', $viewerSegment);
            }
        });
    }

    public function isVisibleAt(?CarbonInterface $at = null): bool
    {
        $at ??= now();

        if ($this->status !== self::STATUS_PUBLISHED) {
            return false;
        }

        if ($this->starts_at?->isAfter($at)) {
            return false;
        }

        if ($this->ends_at?->isBefore($at)) {
            return false;
        }

        return true;
    }

    public function publicationStateAt(?CarbonInterface $at = null): string
    {
        $at ??= now();

        if ($this->status === self::STATUS_DRAFT) {
            return self::STATUS_DRAFT;
        }

        if ($this->status === self::STATUS_HIDDEN) {
            return self::STATUS_HIDDEN;
        }

        if ($this->starts_at?->isAfter($at)) {
            return 'scheduled';
        }

        if ($this->ends_at?->isBefore($at)) {
            return 'expired';
        }

        return 'visible';
    }

    public function imageUrl(): string
    {
        return route('banners.image', ['banner' => $this->public_id], false);
    }

    public static function placementOptions(): array
    {
        return [
            self::PLACEMENT_HOME,
            self::PLACEMENT_THERAPIST_DETAIL,
            self::PLACEMENT_DASHBOARD,
        ];
    }

    public static function viewerSegmentOptions(): array
    {
        return [
            self::VIEWER_SEGMENT_GUEST,
            self::VIEWER_SEGMENT_USER,
            self::VIEWER_SEGMENT_THERAPIST,
        ];
    }

    public static function statusOptions(): array
    {
        return [
            self::STATUS_DRAFT,
            self::STATUS_HIDDEN,
            self::STATUS_PUBLISHED,
        ];
    }

    public static function placementLabel(string $placement): string
    {
        return match ($placement) {
            self::PLACEMENT_HOME => 'トップページ',
            self::PLACEMENT_THERAPIST_DETAIL => 'セラピスト詳細ページ',
            self::PLACEMENT_DASHBOARD => 'ダッシュボード',
            default => $placement,
        };
    }

    public static function viewerSegmentLabel(string $viewerSegment): string
    {
        return match ($viewerSegment) {
            self::VIEWER_SEGMENT_GUEST => '未ログイン',
            self::VIEWER_SEGMENT_USER => '利用者',
            self::VIEWER_SEGMENT_THERAPIST => 'タチキャスト',
            default => $viewerSegment,
        };
    }

    public static function statusLabel(string $status): string
    {
        return match ($status) {
            self::STATUS_DRAFT => '下書き',
            self::STATUS_HIDDEN => '非公開',
            self::STATUS_PUBLISHED => '公開',
            default => $status,
        };
    }

    public static function publicationStateLabel(string $state): string
    {
        return match ($state) {
            'visible' => '表示中',
            'scheduled' => '開始待ち',
            'expired' => '終了済み',
            self::STATUS_DRAFT => '下書き',
            self::STATUS_HIDDEN => '非公開',
            default => $state,
        };
    }

    protected function casts(): array
    {
        return [
            'placements' => 'array',
            'viewer_segments' => 'array',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'sort_order' => 'integer',
            'impression_count' => 'integer',
            'click_count' => 'integer',
        ];
    }
}
