<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Guarded(['id'])]
class LegalDocument extends Model
{
    public static function latestPublishedByTypes(array $documentTypes): Collection
    {
        if ($documentTypes === []) {
            return new Collection;
        }

        $orderMap = array_flip($documentTypes);

        return static::query()
            ->published()
            ->whereIn('document_type', $documentTypes)
            ->orderBy('document_type')
            ->orderByDesc('effective_at')
            ->orderByDesc('published_at')
            ->orderByDesc('id')
            ->get()
            ->unique('document_type')
            ->sortBy(fn (self $document): int => $orderMap[$document->document_type] ?? PHP_INT_MAX)
            ->keyBy('document_type');
    }

    public function acceptances(): HasMany
    {
        return $this->hasMany(LegalAcceptance::class);
    }

    public function bookingConsents(): HasMany
    {
        return $this->hasMany(BookingConsent::class);
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query
            ->whereNotNull('published_at')
            ->where('published_at', '<=', now());
    }

    public function isPublished(): bool
    {
        return $this->published_at !== null && $this->published_at->lte(now());
    }

    protected function casts(): array
    {
        return [
            'published_at' => 'datetime',
            'effective_at' => 'datetime',
        ];
    }
}
