<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ServiceAddressResource;
use App\Models\ServiceAddress;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ServiceAddressController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        return ServiceAddressResource::collection(
            $request->user()->serviceAddresses()
                ->orderByDesc('is_default')
                ->latest()
                ->get()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'label' => ['nullable', 'string', 'max:80'],
            'place_type' => ['required', Rule::in(['home', 'hotel', 'office', 'other'])],
            'postal_code' => ['nullable', 'string', 'max:20'],
            'prefecture' => ['nullable', 'string', 'max:50'],
            'city' => ['nullable', 'string', 'max:100'],
            'address_line' => ['required', 'string', 'max:500'],
            'building' => ['nullable', 'string', 'max:255'],
            'access_notes' => ['nullable', 'string', 'max:1000'],
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lng' => ['required', 'numeric', 'between:-180,180'],
            'is_default' => ['sometimes', 'boolean'],
        ]);

        $address = DB::transaction(function () use ($request, $validated): ServiceAddress {
            $shouldBeDefault = ($validated['is_default'] ?? false)
                || ! $request->user()->serviceAddresses()->exists();

            if ($shouldBeDefault) {
                $request->user()->serviceAddresses()->update(['is_default' => false]);
            }

            return ServiceAddress::create([
                'public_id' => 'addr_'.Str::ulid(),
                'account_id' => $request->user()->id,
                'label' => $validated['label'] ?? null,
                'place_type' => $validated['place_type'],
                'postal_code_encrypted' => isset($validated['postal_code']) ? Crypt::encryptString($validated['postal_code']) : null,
                'prefecture' => $validated['prefecture'] ?? null,
                'city' => $validated['city'] ?? null,
                'address_line_encrypted' => Crypt::encryptString($validated['address_line']),
                'building_encrypted' => isset($validated['building']) ? Crypt::encryptString($validated['building']) : null,
                'access_notes_encrypted' => isset($validated['access_notes']) ? Crypt::encryptString($validated['access_notes']) : null,
                'lat' => $validated['lat'],
                'lng' => $validated['lng'],
                'is_default' => $shouldBeDefault,
            ]);
        });

        return (new ServiceAddressResource($address))
            ->response()
            ->setStatusCode(201);
    }

    public function show(Request $request, ServiceAddress $serviceAddress): ServiceAddressResource
    {
        abort_unless($serviceAddress->account_id === $request->user()->id, 404);

        return new ServiceAddressResource($serviceAddress);
    }

    public function update(Request $request, ServiceAddress $serviceAddress): ServiceAddressResource
    {
        abort_unless($serviceAddress->account_id === $request->user()->id, 404);

        $validated = $request->validate([
            'label' => ['sometimes', 'nullable', 'string', 'max:80'],
            'place_type' => ['sometimes', Rule::in(['home', 'hotel', 'office', 'other'])],
            'postal_code' => ['sometimes', 'nullable', 'string', 'max:20'],
            'prefecture' => ['sometimes', 'nullable', 'string', 'max:50'],
            'city' => ['sometimes', 'nullable', 'string', 'max:100'],
            'address_line' => ['sometimes', 'string', 'max:500'],
            'building' => ['sometimes', 'nullable', 'string', 'max:255'],
            'access_notes' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'lat' => ['sometimes', 'numeric', 'between:-90,90', 'required_with:lng'],
            'lng' => ['sometimes', 'numeric', 'between:-180,180', 'required_with:lat'],
        ]);

        $attributes = [];

        if (array_key_exists('label', $validated)) {
            $attributes['label'] = $validated['label'];
        }

        if (array_key_exists('place_type', $validated)) {
            $attributes['place_type'] = $validated['place_type'];
        }

        if (array_key_exists('postal_code', $validated)) {
            $attributes['postal_code_encrypted'] = filled($validated['postal_code'])
                ? Crypt::encryptString($validated['postal_code'])
                : null;
        }

        if (array_key_exists('prefecture', $validated)) {
            $attributes['prefecture'] = $validated['prefecture'];
        }

        if (array_key_exists('city', $validated)) {
            $attributes['city'] = $validated['city'];
        }

        if (array_key_exists('address_line', $validated)) {
            $attributes['address_line_encrypted'] = Crypt::encryptString($validated['address_line']);
        }

        if (array_key_exists('building', $validated)) {
            $attributes['building_encrypted'] = filled($validated['building'])
                ? Crypt::encryptString($validated['building'])
                : null;
        }

        if (array_key_exists('access_notes', $validated)) {
            $attributes['access_notes_encrypted'] = filled($validated['access_notes'])
                ? Crypt::encryptString($validated['access_notes'])
                : null;
        }

        if (array_key_exists('lat', $validated)) {
            $attributes['lat'] = $validated['lat'];
        }

        if (array_key_exists('lng', $validated)) {
            $attributes['lng'] = $validated['lng'];
        }

        if ($attributes !== []) {
            $serviceAddress->forceFill($attributes)->save();
        }

        return new ServiceAddressResource($serviceAddress->refresh());
    }

    public function setDefault(Request $request, ServiceAddress $serviceAddress): ServiceAddressResource
    {
        abort_unless($serviceAddress->account_id === $request->user()->id, 404);

        DB::transaction(function () use ($request, $serviceAddress): void {
            $request->user()->serviceAddresses()->update(['is_default' => false]);

            $serviceAddress->forceFill(['is_default' => true])->save();
        });

        return new ServiceAddressResource($serviceAddress->refresh());
    }

    public function destroy(Request $request, ServiceAddress $serviceAddress): JsonResponse
    {
        abort_unless($serviceAddress->account_id === $request->user()->id, 404);

        $serviceAddress->delete();

        return response()->json(null, 204);
    }
}
