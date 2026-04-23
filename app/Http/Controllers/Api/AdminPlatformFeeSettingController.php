<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Api\Concerns\RecordsAdminAuditLogs;
use App\Http\Controllers\Controller;
use App\Http\Resources\PlatformFeeSettingResource;
use App\Models\PlatformFeeSetting;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\ValidationException;

class AdminPlatformFeeSettingController extends Controller
{
    use AuthorizesAdminRequests;
    use RecordsAdminAuditLogs;

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorizeAdmin($request->user());

        $validated = $request->validate([
            'setting_key' => ['nullable', 'string', 'max:100'],
            'is_active' => ['nullable', 'boolean'],
        ]);
        $now = now();

        return PlatformFeeSettingResource::collection(
            PlatformFeeSetting::query()
                ->with('createdBy')
                ->when(
                    $validated['setting_key'] ?? null,
                    fn ($query, string $settingKey) => $query->where('setting_key', $settingKey)
                )
                ->when(
                    array_key_exists('is_active', $validated),
                    fn ($query) => $this->applyActiveFilter($query, $validated['is_active'], $now)
                )
                ->orderBy('setting_key')
                ->orderByDesc('active_from')
                ->orderByDesc('id')
                ->get()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $admin = $request->user();
        $this->authorizeAdmin($admin);

        $validated = $request->validate([
            'setting_key' => ['required', 'string', 'max:100'],
            'value_json' => ['required', 'array'],
            'active_from' => ['nullable', 'date'],
            'active_until' => ['nullable', 'date'],
        ]);

        [$activeFrom, $activeUntil] = $this->resolveActiveWindow(
            $validated['active_from'] ?? null,
            $validated['active_until'] ?? null
        );

        $duplicateExists = PlatformFeeSetting::query()
            ->where('setting_key', $validated['setting_key'])
            ->where('active_from', $activeFrom)
            ->exists();

        if ($duplicateExists) {
            throw ValidationException::withMessages([
                'active_from' => ['The combination of setting key and active from must be unique.'],
            ]);
        }

        $setting = PlatformFeeSetting::create([
            'setting_key' => $validated['setting_key'],
            'value_json' => $validated['value_json'],
            'active_from' => $activeFrom,
            'active_until' => $activeUntil,
            'created_by_account_id' => $admin->id,
        ]);

        $setting->load('createdBy');
        $this->recordAdminAudit($request, 'platform_fee_setting.create', $setting, [], $this->snapshot($setting));

        return (new PlatformFeeSettingResource($setting))
            ->response()
            ->setStatusCode(201);
    }

    private function applyActiveFilter($query, bool $isActive, $now): void
    {
        if ($isActive) {
            $query
                ->where(fn ($builder) => $builder
                    ->whereNull('active_from')
                    ->orWhere('active_from', '<=', $now))
                ->where(fn ($builder) => $builder
                    ->whereNull('active_until')
                    ->orWhere('active_until', '>=', $now));

            return;
        }

        $query->where(fn ($builder) => $builder
            ->where('active_from', '>', $now)
            ->orWhere('active_until', '<', $now));
    }

    private function resolveActiveWindow(?string $activeFromInput, ?string $activeUntilInput): array
    {
        $activeFrom = filled($activeFromInput)
            ? CarbonImmutable::parse($activeFromInput)
            : CarbonImmutable::now();
        $activeUntil = filled($activeUntilInput)
            ? CarbonImmutable::parse($activeUntilInput)
            : null;

        if ($activeUntil && $activeUntil->lt($activeFrom)) {
            throw ValidationException::withMessages([
                'active_until' => ['The active until must be after or equal to active from.'],
            ]);
        }

        return [$activeFrom, $activeUntil];
    }

    private function snapshot(PlatformFeeSetting $setting): array
    {
        return $setting->only([
            'id',
            'setting_key',
            'value_json',
            'active_from',
            'active_until',
            'created_by_account_id',
        ]);
    }
}
