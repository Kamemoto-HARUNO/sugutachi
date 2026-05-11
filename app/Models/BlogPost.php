<?php

namespace App\Models;

use App\Models\Concerns\UsesPublicIdRouteKey;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

#[Guarded(['id'])]
class BlogPost extends Model
{
    use SoftDeletes;
    use UsesPublicIdRouteKey;

    public const STATUS_DRAFT = 'draft';

    public const STATUS_PUBLISHED = 'published';

    public const STATUS_HIDDEN = 'hidden';

    public const STATUS_SCHEDULED = 'scheduled';

    public function category(): BelongsTo
    {
        return $this->belongsTo(BlogCategory::class, 'blog_category_id');
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(BlogTag::class, 'blog_post_tag');
    }

    public function slugRedirects(): HasMany
    {
        return $this->hasMany(BlogSlugRedirect::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'created_by_account_id');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'updated_by_account_id');
    }

    public function scopeVisibleToPublic(Builder $query, ?CarbonInterface $at = null): Builder
    {
        $at ??= now();

        return $query
            ->whereNotNull('published_at')
            ->where('published_at', '<=', $at)
            ->whereIn('status', [self::STATUS_PUBLISHED, self::STATUS_SCHEDULED]);
    }

    public function isVisibleToPublic(?CarbonInterface $at = null): bool
    {
        $at ??= now();

        return in_array($this->status, [self::STATUS_PUBLISHED, self::STATUS_SCHEDULED], true)
            && $this->published_at !== null
            && $this->published_at->lte($at);
    }

    public function publicationStateAt(?CarbonInterface $at = null): string
    {
        $at ??= now();

        if ($this->status === self::STATUS_DRAFT || $this->status === self::STATUS_HIDDEN) {
            return $this->status;
        }

        if ($this->status === self::STATUS_SCHEDULED || $this->published_at?->isAfter($at)) {
            return self::STATUS_SCHEDULED;
        }

        return self::STATUS_PUBLISHED;
    }

    public function publicUrl(): string
    {
        return '/blog/'.$this->slug;
    }

    public function coverImageUrl(): ?string
    {
        if (! $this->cover_image_path) {
            return null;
        }

        return route('blog-posts.cover-image', ['post' => $this->public_id], false);
    }

    public static function statusOptions(): array
    {
        return [
            self::STATUS_DRAFT,
            self::STATUS_PUBLISHED,
            self::STATUS_HIDDEN,
            self::STATUS_SCHEDULED,
        ];
    }

    public static function statusLabel(string $status): string
    {
        return match ($status) {
            self::STATUS_DRAFT => '下書き',
            self::STATUS_PUBLISHED => '公開',
            self::STATUS_HIDDEN => '非公開',
            self::STATUS_SCHEDULED => '予約',
            default => $status,
        };
    }

    protected function casts(): array
    {
        return [
            'published_at' => 'datetime',
            'noindex' => 'boolean',
            'view_count' => 'integer',
            'search_view_count' => 'integer',
            'internal_view_count' => 'integer',
            'external_view_count' => 'integer',
            'direct_view_count' => 'integer',
        ];
    }
}
