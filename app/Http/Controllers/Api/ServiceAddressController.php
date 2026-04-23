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
            $request->user()->serviceAddresses()->latest()->get()
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
            if ($validated['is_default'] ?? false) {
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
                'is_default' => $validated['is_default'] ?? false,
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

    public function destroy(Request $request, ServiceAddress $serviceAddress): JsonResponse
    {
        abort_unless($serviceAddress->account_id === $request->user()->id, 404);

        $serviceAddress->delete();

        return response()->json(null, 204);
    }
}
