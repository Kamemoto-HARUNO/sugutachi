<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\TherapistAvailabilitySlotResource;
use App\Models\Booking;
use App\Models\TherapistAvailabilitySlot;
use App\Models\TherapistProfile;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class TherapistAvailabilitySlotController extends Controller
{
    private const MINIMUM_SLOT_DURATION_MINUTES = 60;

    private const BLOCKING_BOOKING_STATUSES = [
        Booking::STATUS_PAYMENT_AUTHORIZING,
        Booking::STATUS_REQUESTED,
        Booking::STATUS_ACCEPTED,
        Booking::STATUS_MOVING,
        Booking::STATUS_ARRIVED,
        Booking::STATUS_IN_PROGRESS,
        Booking::STATUS_THERAPIST_COMPLETED,
        Booking::STATUS_COMPLETED,
    ];

    public function index(Request $request): AnonymousResourceCollection
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'status' => ['nullable', Rule::in([
                TherapistAvailabilitySlot::STATUS_PUBLISHED,
                TherapistAvailabilitySlot::STATUS_HIDDEN,
                TherapistAvailabilitySlot::STATUS_EXPIRED,
            ])],
        ]);

        $profile = $this->therapistProfile($request);
        $this->syncExpiredSlots($profile);

        $slots = $profile->availabilitySlots()
            ->withCount(['bookings as blocking_bookings_count' => fn ($query) => $query
                ->whereIn('status', self::BLOCKING_BOOKING_STATUSES)])
            ->when(isset($validated['status']), fn ($query) => $query->where('status', $validated['status']))
            ->when(isset($validated['from']), fn ($query) => $query->where('end_at', '>=', $validated['from']))
            ->when(isset($validated['to']), fn ($query) => $query->where('start_at', '<=', $validated['to']))
            ->orderBy('start_at')
            ->get();

        return TherapistAvailabilitySlotResource::collection($slots);
    }

    public function store(Request $request): JsonResponse
    {
        $profile = $this->therapistProfile($request);
        $validated = $this->validatedSlotPayload($request, $profile);

        $slot = DB::transaction(function () use ($profile, $validated): TherapistAvailabilitySlot {
            $this->assertNoOverlap($profile, $validated['start_at'], $validated['end_at']);

            return TherapistAvailabilitySlot::create([
                'public_id' => 'slot_'.Str::ulid(),
                'therapist_profile_id' => $profile->id,
                'start_at' => $validated['start_at'],
                'end_at' => $validated['end_at'],
                'status' => $validated['status'],
                'dispatch_base_type' => $validated['dispatch_base_type'],
                'dispatch_area_label' => $validated['dispatch_area_label'],
                'custom_dispatch_base_label' => data_get($validated, 'custom_dispatch_base.label'),
                'custom_dispatch_base_lat' => data_get($validated, 'custom_dispatch_base.lat'),
                'custom_dispatch_base_lng' => data_get($validated, 'custom_dispatch_base.lng'),
                'custom_dispatch_base_accuracy_m' => data_get($validated, 'custom_dispatch_base.accuracy_m'),
                'custom_dispatch_base_geohash' => null,
            ]);
        });

        return (new TherapistAvailabilitySlotResource($slot->loadCount([
            'bookings as blocking_bookings_count' => fn ($query) => $query->whereIn('status', self::BLOCKING_BOOKING_STATUSES),
        ])))
            ->response()
            ->setStatusCode(201);
    }

    public function update(Request $request, TherapistAvailabilitySlot $therapistAvailabilitySlot): TherapistAvailabilitySlotResource
    {
        $profile = $this->therapistProfile($request);
        abort_unless($therapistAvailabilitySlot->therapist_profile_id === $profile->id, 404);

        $validated = $this->validatedSlotPayload($request, $profile, $therapistAvailabilitySlot, partial: true);

        $slot = DB::transaction(function () use ($therapistAvailabilitySlot, $validated, $profile): TherapistAvailabilitySlot {
            $lockedSlot = TherapistAvailabilitySlot::query()
                ->whereKey($therapistAvailabilitySlot->id)
                ->lockForUpdate()
                ->firstOrFail();

            abort_if(
                $lockedSlot->bookings()->whereIn('status', self::BLOCKING_BOOKING_STATUSES)->exists(),
                409,
                'Availability slots with active bookings cannot be updated.'
            );

            $this->assertNoOverlap(
                $profile,
                $validated['start_at'],
                $validated['end_at'],
                $lockedSlot->id
            );

            $lockedSlot->forceFill([
                'start_at' => $validated['start_at'],
                'end_at' => $validated['end_at'],
                'status' => $validated['status'],
                'dispatch_base_type' => $validated['dispatch_base_type'],
                'dispatch_area_label' => $validated['dispatch_area_label'],
                'custom_dispatch_base_label' => data_get($validated, 'custom_dispatch_base.label'),
                'custom_dispatch_base_lat' => data_get($validated, 'custom_dispatch_base.lat'),
                'custom_dispatch_base_lng' => data_get($validated, 'custom_dispatch_base.lng'),
                'custom_dispatch_base_accuracy_m' => data_get($validated, 'custom_dispatch_base.accuracy_m'),
                'custom_dispatch_base_geohash' => null,
            ])->save();

            return $lockedSlot->refresh();
        });

        return new TherapistAvailabilitySlotResource($slot->loadCount([
            'bookings as blocking_bookings_count' => fn ($query) => $query->whereIn('status', self::BLOCKING_BOOKING_STATUSES),
        ]));
    }

    public function destroy(Request $request, TherapistAvailabilitySlot $therapistAvailabilitySlot): Response
    {
        $profile = $this->therapistProfile($request);
        abort_unless($therapistAvailabilitySlot->therapist_profile_id === $profile->id, 404);

        DB::transaction(function () use ($therapistAvailabilitySlot): void {
            $lockedSlot = TherapistAvailabilitySlot::query()
                ->whereKey($therapistAvailabilitySlot->id)
                ->lockForUpdate()
                ->firstOrFail();

            abort_if(
                $lockedSlot->bookings()->whereIn('status', self::BLOCKING_BOOKING_STATUSES)->exists(),
                409,
                'Availability slots with active bookings cannot be deleted.'
            );

            $lockedSlot->delete();
        });

        return response()->noContent();
    }

    private function therapistProfile(Request $request): TherapistProfile
    {
        $profile = $request->user()->therapistProfile()->with('bookingSetting')->firstOrFail();

        abort_if(
            $profile->profile_status === TherapistProfile::STATUS_SUSPENDED,
            409,
            'Suspended therapist profiles cannot manage availability slots.'
        );

        return $profile;
    }

    private function validatedSlotPayload(
        Request $request,
        TherapistProfile $profile,
        ?TherapistAvailabilitySlot $currentSlot = null,
        bool $partial = false,
    ): array {
        $validated = $request->validate([
            'start_at' => [$partial ? 'sometimes' : 'required', 'date'],
            'end_at' => [$partial ? 'sometimes' : 'required', 'date'],
            'status' => [$partial ? 'sometimes' : 'required', Rule::in([
                TherapistAvailabilitySlot::STATUS_PUBLISHED,
                TherapistAvailabilitySlot::STATUS_HIDDEN,
            ])],
            'dispatch_base_type' => [$partial ? 'sometimes' : 'required', Rule::in([
                TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_DEFAULT,
                TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_CUSTOM,
            ])],
            'dispatch_area_label' => ['sometimes', 'nullable', 'string', 'max:120'],
            'custom_dispatch_base.label' => ['sometimes', 'nullable', 'string', 'max:120'],
            'custom_dispatch_base.lat' => ['sometimes', 'numeric', 'between:-90,90'],
            'custom_dispatch_base.lng' => ['sometimes', 'numeric', 'between:-180,180'],
            'custom_dispatch_base.accuracy_m' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:10000'],
        ]);

        $explicitDispatchAreaLabel = array_key_exists('dispatch_area_label', $validated)
            ? $validated['dispatch_area_label']
            : null;

        $resolved = [
            'start_at' => $validated['start_at'] ?? $currentSlot?->start_at?->toIso8601String(),
            'end_at' => $validated['end_at'] ?? $currentSlot?->end_at?->toIso8601String(),
            'status' => $validated['status'] ?? $currentSlot?->status ?? TherapistAvailabilitySlot::STATUS_PUBLISHED,
            'dispatch_base_type' => $validated['dispatch_base_type'] ?? $currentSlot?->dispatch_base_type ?? TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_DEFAULT,
            'dispatch_area_label' => $explicitDispatchAreaLabel,
            'custom_dispatch_base' => [
                'label' => data_get($validated, 'custom_dispatch_base.label', $currentSlot?->custom_dispatch_base_label),
                'lat' => data_get($validated, 'custom_dispatch_base.lat', $currentSlot?->custom_dispatch_base_lat),
                'lng' => data_get($validated, 'custom_dispatch_base.lng', $currentSlot?->custom_dispatch_base_lng),
                'accuracy_m' => data_get($validated, 'custom_dispatch_base.accuracy_m', $currentSlot?->custom_dispatch_base_accuracy_m),
            ],
        ];

        if (! $resolved['start_at'] || ! $resolved['end_at']) {
            throw ValidationException::withMessages([
                'start_at' => ['Start and end time are required.'],
            ]);
        }

        $startAt = CarbonImmutable::parse($resolved['start_at']);
        $endAt = CarbonImmutable::parse($resolved['end_at']);

        if ($startAt->greaterThanOrEqualTo($endAt)) {
            throw ValidationException::withMessages([
                'end_at' => ['The end time must be after the start time.'],
            ]);
        }

        if ($startAt->isPast()) {
            throw ValidationException::withMessages([
                'start_at' => ['Availability slots must start in the future.'],
            ]);
        }

        if (! $this->isQuarterHourAligned($startAt) || ! $this->isQuarterHourAligned($endAt)) {
            throw ValidationException::withMessages([
                'start_at' => ['Availability slots must align to 15-minute increments.'],
                'end_at' => ['Availability slots must align to 15-minute increments.'],
            ]);
        }

        if ($startAt->diffInMinutes($endAt) < self::MINIMUM_SLOT_DURATION_MINUTES) {
            throw ValidationException::withMessages([
                'end_at' => ['Availability slots must be at least 60 minutes long.'],
            ]);
        }

        if ($resolved['dispatch_base_type'] === TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_DEFAULT) {
            if (! $profile->bookingSetting) {
                throw ValidationException::withMessages([
                    'dispatch_base_type' => ['Scheduled booking settings are required before using the default dispatch base.'],
                ]);
            }

            $resolved['custom_dispatch_base'] = [
                'label' => null,
                'lat' => null,
                'lng' => null,
                'accuracy_m' => null,
            ];
        }

        if ($resolved['dispatch_base_type'] === TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_CUSTOM) {
            if (
                data_get($resolved, 'custom_dispatch_base.lat') === null
                || data_get($resolved, 'custom_dispatch_base.lng') === null
            ) {
                throw ValidationException::withMessages([
                    'custom_dispatch_base.lat' => ['A custom dispatch base latitude is required.'],
                    'custom_dispatch_base.lng' => ['A custom dispatch base longitude is required.'],
                ]);
            }
        }

        $resolved['dispatch_area_label'] = $this->resolveDispatchAreaLabel(
            explicitLabel: $resolved['dispatch_area_label'],
            dispatchBaseType: $resolved['dispatch_base_type'],
            scheduledBaseLabel: $profile->bookingSetting?->scheduled_base_label,
            customBaseLabel: data_get($resolved, 'custom_dispatch_base.label'),
            fallbackCurrentLabel: $currentSlot?->dispatch_area_label,
        );

        $resolved['start_at'] = $startAt;
        $resolved['end_at'] = $endAt;

        return $resolved;
    }

    private function assertNoOverlap(
        TherapistProfile $profile,
        CarbonImmutable $startAt,
        CarbonImmutable $endAt,
        ?int $ignoreSlotId = null,
    ): void {
        $overlapExists = $profile->availabilitySlots()
            ->when($ignoreSlotId, fn ($query) => $query->whereKeyNot($ignoreSlotId))
            ->where('start_at', '<', $endAt)
            ->where('end_at', '>', $startAt)
            ->exists();

        if ($overlapExists) {
            throw ValidationException::withMessages([
                'start_at' => ['Availability slots cannot overlap existing slots.'],
            ]);
        }
    }

    private function syncExpiredSlots(TherapistProfile $profile): void
    {
        $profile->availabilitySlots()
            ->whereIn('status', [
                TherapistAvailabilitySlot::STATUS_PUBLISHED,
                TherapistAvailabilitySlot::STATUS_HIDDEN,
            ])
            ->where('end_at', '<=', CarbonImmutable::now())
            ->update([
                'status' => TherapistAvailabilitySlot::STATUS_EXPIRED,
            ]);
    }

    private function isQuarterHourAligned(CarbonImmutable $time): bool
    {
        return $time->second === 0 && $time->minute % 15 === 0;
    }

    private function resolveDispatchAreaLabel(
        ?string $explicitLabel,
        string $dispatchBaseType,
        ?string $scheduledBaseLabel,
        ?string $customBaseLabel,
        ?string $fallbackCurrentLabel,
    ): string {
        if (filled($explicitLabel)) {
            return trim((string) $explicitLabel);
        }

        return match ($dispatchBaseType) {
            TherapistAvailabilitySlot::DISPATCH_BASE_TYPE_CUSTOM => $this->areaLabelFromBaseLabel(
                $customBaseLabel,
                $fallbackCurrentLabel ?? '枠専用拠点周辺',
            ),
            default => $this->areaLabelFromBaseLabel(
                $scheduledBaseLabel,
                $fallbackCurrentLabel ?? '基本拠点周辺',
            ),
        };
    }

    private function areaLabelFromBaseLabel(?string $label, string $fallback): string
    {
        if (! filled($label)) {
            return $fallback;
        }

        $normalized = trim(preg_replace('/\s+/u', ' ', (string) $label) ?? '');

        if ($normalized === '') {
            return $fallback;
        }

        if (preg_match('/(周辺|付近)$/u', $normalized) === 1) {
            return $normalized;
        }

        $stripped = preg_replace(
            '/(?:\s|-)?(ベース|拠点|サテライト|Base|BASE|base|Visit|VISIT|visit|Satellite|SATELLITE|satellite|Hub|HUB|hub)$/u',
            '',
            $normalized,
        );
        $stripped = trim($stripped ?? '');

        if ($stripped === '') {
            return $fallback;
        }

        return $stripped.'周辺';
    }
}
